/*
 * Ported from IllustFerry (https://github.com/peasoft/IllustFerry) — GPL-3.0
 * Original: app/src/main/java/JunZi/Pixiv/data/network/LocalPixivProxy.kt
 *
 * 本文件基于 IllustFerry 移植，调整了包名与类名（LocalPixivProxy -> LocalLoginProxy）、
 * CA 主题名与 keystore alias，用于应用内官网登录的 WebView 网络通道。
 * 与上游的行为差异：上游 TLS 从 no-SNI 改为带 SNI 直拨（pixiv 源站已对无 SNI 一律 403，
 * 详见 createUpstreamTlsSocket 注释），广告黑名单补了 content-autofill.googleapis.com。
 */
package com.pixiv.login.network

import android.util.Log
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import java.util.Collections
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedDeque
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager
import java.security.KeyStore
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.PrivateKey
import java.security.Provider
import java.security.SecureRandom
import java.security.Security
import java.security.cert.X509Certificate
import java.util.Date
import org.bouncycastle.asn1.x500.X500Name
import org.bouncycastle.asn1.x509.BasicConstraints
import org.bouncycastle.asn1.x509.Extension
import org.bouncycastle.asn1.x509.GeneralName
import org.bouncycastle.asn1.x509.GeneralNames
import org.bouncycastle.asn1.x509.KeyPurposeId
import org.bouncycastle.asn1.x509.KeyUsage
import org.bouncycastle.asn1.x509.ExtendedKeyUsage
import org.bouncycastle.cert.X509CertificateHolder
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter
import org.bouncycastle.cert.jcajce.JcaX509ExtensionUtils
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.bouncycastle.operator.ContentSigner
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder

class LocalLoginProxy(
    preferredPort: Int = 7891,
) {
    private val running = AtomicBoolean(false)
    // 兼容 API 22：ConcurrentHashMap.newKeySet() 要 API 24（IllustFerry minSdk 26），这里用等价写法
    private val activeSockets: MutableSet<Socket> = Collections.newSetFromMap(ConcurrentHashMap())
    private val certificateAuthority by lazy { inMemoryCertificateAuthority }
    private val serverSslContexts = ConcurrentHashMap<String, SSLContext>()
    @Volatile
    private var executor: ExecutorService? = null
    private var serverSocket: ServerSocket? = null

    var port: Int = preferredPort
        private set

    @Synchronized
    fun start() {
        if (running.get()) return
        lastProxyError = null
        lastProxyEvent = null
        reportState("start requested")
        val newExecutor = Executors.newCachedThreadPool()
        val newServerSocket = bindServerSocket(port)
        executor = newExecutor
        serverSocket = newServerSocket.also { port = it.localPort }
        running.set(true)
        reportState("listening 127.0.0.1:${newServerSocket.localPort}")
        newExecutor.execute { acceptLoop(newServerSocket, newExecutor) }
    }

    @Synchronized
    fun stop() {
        running.set(false)
        reportState("stop requested")
        runCatching { serverSocket?.close() }
        serverSocket = null
        activeSockets.forEach { socket ->
            runCatching { socket.close() }
        }
        activeSockets.clear()
        executor?.shutdownNow()
        executor = null
    }

    fun isRunning(): Boolean = running.get()

    private fun bindServerSocket(preferredPort: Int): ServerSocket {
        return runCatching {
            ServerSocket(preferredPort, 64, InetAddress.getByName("127.0.0.1"))
        }.getOrElse {
            ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"))
        }
    }

    private fun acceptLoop(server: ServerSocket, executor: ExecutorService) {
        while (running.get()) {
            val client = runCatching { server.accept() }.getOrNull() ?: break
            reportState("accepted ${client.inetAddress.hostAddress}:${client.port}")
            trackSocket(client)
            runCatching {
                executor.execute { handleClient(client, executor) }
            }.onFailure {
                reportError("acceptLoop dispatch", it)
                closeAndForget(client)
            }
        }
        if (running.get()) {
            reportState("accept loop ended unexpectedly")
        }
    }

    private fun handleClient(client: Socket, executor: ExecutorService) {
        try {
            client.use { source ->
                source.soTimeout = 20_000
                val input = source.getInputStream()
                val firstLine = input.readAsciiLine() ?: return
                reportState("request $firstLine")
                val requestLine = parseRequestLine(firstLine)
                if (requestLine == null) {
                    sendSimpleResponse(source, 400, "Bad Request")
                    return
                }
                if (requestLine.method.equals("CONNECT", ignoreCase = true)) {
                    handleConnect(source, input, requestLine, executor)
                } else {
                    handleHttp(source, input, requestLine)
                }
            }
        } catch (throwable: Throwable) {
            reportError("handleClient", throwable)
        } finally {
            activeSockets.remove(client)
        }
    }

    private fun handleConnect(
        client: Socket,
        clientInput: InputStream,
        requestLine: RequestLine,
        executor: ExecutorService,
    ) {
        val rawTarget = parseAuthority(requestLine.target, defaultPort = 443)
        if (rawTarget == null) {
            drainHeaders(clientInput)
            sendSimpleResponse(client, 400, "Bad Request")
            return
        }
        drainHeaders(clientInput)

        if (isBlockedHost(rawTarget.host)) {
            reportState("blocked ${rawTarget.host}:${rawTarget.port}")
            sendSimpleResponse(client, 502, "Bad Gateway")
            return
        }
        val target = rewriteHost(rawTarget.host)?.let { rewritten ->
            reportState("rewrite ${rawTarget.host} -> $rewritten")
            rawTarget.copy(host = rewritten)
        } ?: rawTarget

        var tunnelEstablished = false
        try {
            val clientOutput = client.getOutputStream()
            clientOutput.write("HTTP/1.1 200 Connection Established\r\n\r\n".toByteArray(Charsets.US_ASCII))
            clientOutput.flush()
            tunnelEstablished = true
            reportState("connect established ${target.host}:${target.port}")

            if (shouldMitm(target.host, target.port)) {
                reportState("mitm selected ${target.host}:${target.port}")
                handleMitmTunnel(client, target, executor)
            } else {
                reportState("transparent selected ${target.host}:${target.port}")
                handleTransparentTunnel(client, target, executor)
            }
        } catch (throwable: Throwable) {
            reportError("handleConnect ${target.host}:${target.port}", throwable)
            if (!tunnelEstablished) {
                sendSimpleResponse(client, 502, "Bad Gateway")
            }
        }
    }

    private fun handleTransparentTunnel(
        client: Socket,
        target: Authority,
        executor: ExecutorService,
    ) {
        // 透明隧道用 5 秒拨号截止——pixiv 自家拨不通的子域 / 没在 block 表里的第三方
        // 走到这里就别再陪它磨 20 秒，省得 WebView 等所有子资源齐了才放 onPageFinished。
        val upstream = connectUpstream(target.host, target.port, 5_000)
        upstream.soTimeout = 0
        client.soTimeout = 0
        try {
            proxySockets(
                clientInput = client.getInputStream(),
                clientOutput = client.getOutputStream(),
                clientSocket = client,
                upstreamInput = upstream.getInputStream(),
                upstreamOutput = upstream.getOutputStream(),
                upstreamSocket = upstream,
                executor = executor,
            )
        } finally {
            closeAndForget(upstream)
        }
    }

    private fun handleMitmTunnel(
        client: Socket,
        target: Authority,
        executor: ExecutorService,
    ) {
        val (upstream, upstreamTls) = openMitmUpstream(target.host, target.port, 20_000)
        upstream.soTimeout = 0
        client.soTimeout = 0
        reportState("client tls handshake ${target.host}:${target.port}")
        val clientTls = createClientFacingTlsSocket(client, target.host)
        try {
            proxyMitmHttp(
                clientTls = clientTls,
                upstreamTls = upstreamTls,
                host = target.host,
                executor = executor,
            )
        } finally {
            runCatching { clientTls.close() }
            runCatching { upstreamTls.close() }
            closeAndForget(upstream)
        }
    }

    /**
     * 给 MITM 链路用：把 TCP 和 TLS 握手当成一对原子操作做候选回退。
     * 之前的 connectUpstream 只在 TCP 层 break，一旦 172.64.x 这种 IP TCP 通了但
     * TLS 被对端（或 GFW）RST，整条 MITM 就死了。OkHttp 默认就是 TCP+TLS 一起重试，
     * 这里复现同样语义，但候选只能来自运行时/持久化的动态 Host IP 表。
     */
    private fun openMitmUpstream(host: String, port: Int, timeoutMillis: Int): Pair<Socket, SSLSocket> {
        val candidates = mitmUpstreamCandidates(host)
        var lastFailure: Throwable? = null
        candidates.forEach { candidate ->
            val tcp = trackSocket(Socket())
            try {
                reportState("dial $host:$port via $candidate")
                tcp.connect(InetSocketAddress(candidate, port), timeoutMillis)
                reportState("dial success $host:$port via $candidate")
                tcp.soTimeout = timeoutMillis
                reportState("upstream tls handshake $host:$port via $candidate")
                val tls = createUpstreamTlsSocket(tcp, host, port)
                tcp.soTimeout = 0
                return tcp to tls
            } catch (error: Throwable) {
                lastFailure = error
                reportError("upstream $host:$port via $candidate", error)
                closeAndForget(tcp)
            }
        }
        throw IOException(
            "All upstream candidates failed for $host (${candidates.joinToString()})",
            lastFailure,
        )
    }

    private fun mitmUpstreamCandidates(host: String): List<String> {
        val mapped = PixivNetworkConfig.addressesFor(host)
        if (mapped.isNotEmpty()) return mapped
        if (!PixivNetworkConfig.requiresDynamicRoute(host)) return listOf(host)
        return mapped.ifEmpty {
            throw IOException("No dynamic IP for $host; proxy upstream is not ready")
        }
    }

    private fun handleHttp(client: Socket, clientInput: InputStream, requestLine: RequestLine) {
        val headers = readHeaders(clientInput) ?: run {
            sendSimpleResponse(client, 400, "Bad Request")
            return
        }
        val rawTarget = parseHttpTarget(requestLine.target, headers) ?: run {
            sendSimpleResponse(client, 400, "Bad Request")
            return
        }
        if (isBlockedHost(rawTarget.host)) {
            reportState("blocked ${rawTarget.host}:${rawTarget.port}")
            sendSimpleResponse(client, 502, "Bad Gateway")
            return
        }
        val target = rewriteHost(rawTarget.host)?.let { rewritten ->
            reportState("rewrite ${rawTarget.host} -> $rewritten")
            rawTarget.copy(host = rewritten)
        } ?: rawTarget
        val contentLength = headers.contentLength()
        val chunked = headers.isChunked()
        val expectsContinue = headers.expectsContinue()
        if (expectsContinue) {
            sendContinue(client)
        }

        var upstream: Socket? = null
        var responseStarted = false
        try {
            val server = connectUpstream(target.host, target.port, 20_000)
            upstream = server
            server.soTimeout = 20_000

            val upstreamOutput = server.getOutputStream()
            upstreamOutput.write(
                buildHttpRequestHead(
                    requestLine = requestLine,
                    target = target,
                    headers = headers,
                    skipExpect = expectsContinue,
                ),
            )
            if (chunked) {
                copyChunkedBody(clientInput, upstreamOutput)
            } else if (contentLength != null && contentLength > 0) {
                copyFixedLength(clientInput, upstreamOutput, contentLength)
            }
            upstreamOutput.flush()

            server.getInputStream().copyResponseTo(client.getOutputStream()) {
                responseStarted = true
            }
        } catch (throwable: Throwable) {
            reportError("handleHttp ${target.host}:${target.port}", throwable)
            if (!responseStarted) {
                sendSimpleResponse(client, 502, "Bad Gateway")
            }
        } finally {
            upstream?.let { closeAndForget(it) }
        }
    }

    private fun connectUpstream(host: String, port: Int, timeoutMillis: Int): Socket {
        val mapped = PixivNetworkConfig.addressesFor(host)
        val candidates = if (mapped.isNotEmpty()) {
            mapped
        } else if (PixivNetworkConfig.requiresDynamicRoute(host)) {
            throw IOException("No dynamic IP for $host; proxy upstream is not ready")
        } else {
            listOf(host)
        }
        var lastFailure: IOException? = null
        candidates.forEach { candidate ->
            val socket = trackSocket(Socket())
            try {
                reportState("dial $host:$port via $candidate")
                socket.connect(InetSocketAddress(candidate, port), timeoutMillis)
                reportState("dial success $host:$port via $candidate")
                return socket
            } catch (error: IOException) {
                lastFailure = error
                reportError("dial $host:$port via $candidate", error)
                closeAndForget(socket)
            }
        }
        throw lastFailure ?: IOException("No upstream address for $host")
    }

    private fun proxySockets(
        clientInput: InputStream,
        clientOutput: OutputStream,
        clientSocket: Socket,
        upstreamInput: InputStream,
        upstreamOutput: OutputStream,
        upstreamSocket: Socket,
        executor: ExecutorService,
    ) {
        val clientToServer = executor.submit {
            clientInput.copyToAndClose(upstreamOutput, upstreamSocket, clientSocket)
        }
        val serverToClient = executor.submit {
            upstreamInput.copyToAndClose(clientOutput, upstreamSocket, clientSocket)
        }
        runCatching { clientToServer.get() }
        runCatching { serverToClient.get() }
    }

    /**
     * MITM 隧道里走 HTTP 明文层的诊断管道：在 ALPN 强制为 http/1.1 的前提下，按行解析
     * 请求 / 响应，把 host + method + path + 状态码 + 端到端耗时打到 [reportState]。
     * 这条路径取代 [proxySockets]：仍然是双向流，但中间是结构化转发，不是 raw byte pump。
     *
     * 设计要点：
     *  - 收到 101 Switching Protocols 时切换到原始字节透传（WebSocket / H2C upgrade），
     *    [upgraded] 同步给请求方向，避免它继续按 HTTP 行解析 WS 二进制帧。
     *  - body 路径完全复用 [copyFixedLength] / [copyChunkedBody]，保证大文件不被 16KB
     *    buffer 拖慢；不引入额外的解码层（不解 HPACK、不解 gzip）。
     *  - [pending] 是 FIFO 队列，自然支持 HTTP/1.1 pipelining；100-continue 用 peek，
     *    真正的最终响应才 poll。
     */
    private fun proxyMitmHttp(
        clientTls: SSLSocket,
        upstreamTls: SSLSocket,
        host: String,
        executor: ExecutorService,
    ) {
        val pending = ConcurrentLinkedDeque<MitmRequest>()
        val upgraded = AtomicBoolean(false)
        val reqJob = executor.submit {
            try {
                relayClientToUpstream(
                    input = clientTls.getInputStream(),
                    output = upstreamTls.getOutputStream(),
                    host = host,
                    pending = pending,
                    upgraded = upgraded,
                )
            } catch (_: Throwable) {
                // 端到端断开（client 关闭 / 上游 RST / TLS close_notify）在 read/write 上抛
                // 都是常规收尾，不写 error 流，免得淹没真正的故障。
            } finally {
                runCatching { upstreamTls.close() }
                runCatching { clientTls.close() }
            }
        }
        val respJob = executor.submit {
            try {
                relayUpstreamToClient(
                    input = upstreamTls.getInputStream(),
                    output = clientTls.getOutputStream(),
                    host = host,
                    pending = pending,
                    upgraded = upgraded,
                )
            } catch (_: Throwable) {
            } finally {
                runCatching { upstreamTls.close() }
                runCatching { clientTls.close() }
            }
        }
        runCatching { reqJob.get() }
        runCatching { respJob.get() }
    }

    private fun relayClientToUpstream(
        input: InputStream,
        output: OutputStream,
        host: String,
        pending: ConcurrentLinkedDeque<MitmRequest>,
        upgraded: AtomicBoolean,
    ) {
        while (!upgraded.get()) {
            val requestLineText = input.readAsciiLine() ?: return
            if (requestLineText.isEmpty()) continue
            val headers = readHeaders(input)
                ?: throw IOException("mitm req malformed headers $host")
            val requestLine = parseRequestLine(requestLineText)
            val method = requestLine?.method ?: "?"
            val path = requestLine?.target ?: requestLineText.take(120)
            reportState("mitm req $host $method $path")
            pending.addLast(
                MitmRequest(
                    method = method,
                    path = path,
                    startedAt = System.currentTimeMillis(),
                ),
            )

            writeAsciiLine(output, requestLineText)
            headers.forEach { writeAsciiLine(output, "${it.name}: ${it.value}") }
            writeAsciiLine(output, "")

            val contentLength = headers.contentLength()
            val chunked = headers.isChunked()
            if (chunked) {
                copyChunkedBody(input, output)
            } else if (contentLength != null && contentLength > 0) {
                copyFixedLength(input, output, contentLength)
            }
            output.flush()
        }
        pumpRawBytes(input, output)
    }

    private fun relayUpstreamToClient(
        input: InputStream,
        output: OutputStream,
        host: String,
        pending: ConcurrentLinkedDeque<MitmRequest>,
        upgraded: AtomicBoolean,
    ) {
        while (!upgraded.get()) {
            val statusLineText = input.readAsciiLine() ?: return
            if (statusLineText.isEmpty()) continue
            val statusCode = parseStatusCode(statusLineText)
            val headers = readHeaders(input)
                ?: throw IOException("mitm resp malformed headers $host")
            val informational = statusCode in 100..199 && statusCode != 101
            val request = if (informational) pending.peekFirst() else pending.pollFirst()
            val elapsedMs = request?.let { System.currentTimeMillis() - it.startedAt }
            val method = request?.method ?: "?"
            val pathPreview = request?.path?.take(80) ?: "?"
            if (elapsedMs != null) {
                reportState("mitm resp $host $statusCode (${elapsedMs}ms) $method $pathPreview")
            } else {
                reportState("mitm resp $host $statusCode $method $pathPreview")
            }

            writeAsciiLine(output, statusLineText)
            headers.forEach { writeAsciiLine(output, "${it.name}: ${it.value}") }
            writeAsciiLine(output, "")

            if (statusCode == 101) {
                // Switching Protocols：之后是非 HTTP 帧（WebSocket / H2C 等）。
                // 通知请求方向也切到 raw，然后这里跳出循环走透传。
                upgraded.set(true)
                output.flush()
                break
            }

            val noBody = informational ||
                statusCode == 204 ||
                statusCode == 304 ||
                method.equals("HEAD", ignoreCase = true)
            if (!noBody) {
                val contentLength = headers.contentLength()
                val chunked = headers.isChunked()
                when {
                    chunked -> copyChunkedBody(input, output)
                    contentLength != null -> {
                        if (contentLength > 0) copyFixedLength(input, output, contentLength)
                    }
                    else -> {
                        // 既无 Content-Length 也非 chunked —— HTTP/1.0 风格，body 到 EOF。
                        // 直接 pump 完后这条 TLS 连接也该结束了。
                        output.flush()
                        pumpRawBytes(input, output)
                        return
                    }
                }
            }
            output.flush()
        }
        if (upgraded.get()) {
            pumpRawBytes(input, output)
        }
    }

    private fun pumpRawBytes(input: InputStream, output: OutputStream) {
        val buffer = ByteArray(16 * 1024)
        while (true) {
            val read = input.read(buffer)
            if (read == -1) break
            output.write(buffer, 0, read)
            output.flush()
        }
    }

    private fun parseStatusCode(statusLine: String): Int {
        val parts = statusLine.split(' ', limit = 3)
        return parts.getOrNull(1)?.toIntOrNull() ?: -1
    }

    private fun shouldMitm(host: String, port: Int): Boolean {
        if (port != 443) return false
        return isMitmHost(host)
    }

    private fun createClientFacingTlsSocket(client: Socket, host: String): SSLSocket {
        val socket = (serverSslContextFor(host).socketFactory.createSocket(client, host, client.port, false) as SSLSocket)
        socket.useClientMode = false
        socket.needClientAuth = false
        forceHttp11Alpn(socket)
        socket.startHandshake()
        return socket
    }

    private fun createUpstreamTlsSocket(upstream: Socket, host: String, port: Int): SSLSocket {
        // 上游必须带 SNI（servername = 真实域名）。2026-09 实测：pixiv 源站 nginx 对无 SNI
        // 连接一律 403（app-api / oauth / accounts / www 全部命中，仅 public-api 还保留
        // default vhost），IllustFerry 的 no-SNI 策略对登录链路已失效。这些域名如今的正确
        // 路由是 Cloudflare anycast（PixivDnsUpdater 按 host 各自解析出 104.18.x/172.64.x）
        // + SNI；TLS 证书校验由 clientSslContext 的 permissive trust 兜底。
        // TCP+TLS 原子回退保留：候选 IP "TCP 通但 TLS 被 RST" 时换下一个候选重来。
        reportState("upstream tls strategy sni $host via ${upstream.inetAddress.hostAddress}:$port")
        val socket = (clientSslContext.socketFactory.createSocket(upstream, host, port, true) as SSLSocket)
        socket.useClientMode = true
        socket.enabledProtocols = socket.supportedProtocols
        forceHttp11Alpn(socket)
        socket.startHandshake()
        return socket
    }

    /**
     * 强制 ALPN 只剩 http/1.1，这样上下游协商出来一定是 1.1 文本协议——MITM 里能直接按行
     * 解析 [proxyMitmHttp]。不强制的话 conscrypt 会拿到 h2，框架二进制 + HPACK 没办法
     * 在不引依赖的前提下做日志。`setApplicationProtocols` 是 API 29 才进 JDK 的，
     * 通过反射兜底，旧机型上拿不到方法就直接放过，连接仍按默认协议跑只是少一份诊断。
     */
    private fun forceHttp11Alpn(socket: SSLSocket) {
        runCatching {
            val params = socket.sslParameters
            params.javaClass.getMethod("setApplicationProtocols", Array<String>::class.java)
                .invoke(params, arrayOf("http/1.1"))
            socket.sslParameters = params
        }
    }

    private fun serverSslContextFor(host: String): SSLContext {
        val normalized = host.trim().lowercase(Locale.US).removeSuffix(".")
        return serverSslContexts.getOrPut(normalized) {
            lastProxyEvent = "build server ssl context $normalized"
            stage("build server ssl context $normalized") {
                val leafKeyPair = stage("build leaf keypair $normalized") { generateKeyPair() }
                val ca = stage("load ca $normalized") { certificateAuthority }
                val issuer = X500Name(ca.certificate.subjectX500Principal.name)
                val subject = X500Name("CN=$normalized")
                val notBefore = Date(System.currentTimeMillis() - 24L * 60L * 60L * 1000L)
                val notAfter = Date(System.currentTimeMillis() + 365L * 24L * 60L * 60L * 1000L)
                val builder = JcaX509v3CertificateBuilder(
                    issuer,
                    randomSerialNumber(),
                    notBefore,
                    notAfter,
                    subject,
                    leafKeyPair.public,
                )
                builder.addExtension(Extension.basicConstraints, true, BasicConstraints(false))
                builder.addExtension(
                    Extension.keyUsage,
                    true,
                    KeyUsage(KeyUsage.digitalSignature or KeyUsage.keyEncipherment),
                )
                builder.addExtension(
                    Extension.extendedKeyUsage,
                    false,
                    ExtendedKeyUsage(KeyPurposeId.id_kp_serverAuth),
                )
                builder.addExtension(
                    Extension.subjectAlternativeName,
                    false,
                    GeneralNames(GeneralName(GeneralName.dNSName, normalized)),
                )
                builder.addExtension(
                    Extension.subjectKeyIdentifier,
                    false,
                    extensionUtils.createSubjectKeyIdentifier(leafKeyPair.public),
                )
                builder.addExtension(
                    Extension.authorityKeyIdentifier,
                    false,
                    extensionUtils.createAuthorityKeyIdentifier(ca.certificate),
                )
                val signer = stage("build leaf signer $normalized") { buildContentSigner(ca.privateKey) }
                val holder = stage("build leaf certificate holder $normalized") { builder.build(signer) }
                val leafCertificate = stage("convert leaf certificate $normalized") { convertCertificate(holder) }
                stage("verify leaf certificate $normalized") { leafCertificate.verify(ca.certificate.publicKey) }

                val keyStore = stage("create keystore $normalized") {
                    KeyStore.getInstance(KeyStore.getDefaultType()).apply {
                        load(null, null)
                        setKeyEntry(
                            "pixiv-local-proxy-$normalized",
                            leafKeyPair.private,
                            CharArray(0),
                            arrayOf<X509Certificate>(leafCertificate, ca.certificate),
                        )
                    }
                }
                val keyManagers = stage("create key managers $normalized") {
                    KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()).apply {
                        init(keyStore, CharArray(0))
                    }.keyManagers
                }
                stage("create ssl context $normalized") {
                    SSLContext.getInstance("TLS").apply {
                        init(keyManagers, null, secureRandom)
                    }
                }
            }
        }
    }

    private fun drainHeaders(input: InputStream) {
        while (true) {
            val line = input.readAsciiLine() ?: return
            if (line.isEmpty()) return
        }
    }

    private fun readHeaders(input: InputStream): List<HttpHeader>? {
        val headers = mutableListOf<HttpHeader>()
        while (true) {
            val line = input.readAsciiLine() ?: return null
            if (line.isEmpty()) return headers
            val separator = line.indexOf(':')
            if (separator <= 0) return null
            headers += HttpHeader(
                name = line.substring(0, separator),
                value = line.substring(separator + 1).trimStart(),
            )
        }
    }

    private fun parseRequestLine(line: String): RequestLine? {
        val parts = line.trim().split(Regex("\\s+"), limit = 3)
        if (parts.size != 3) return null
        val method = parts[0]
        val target = parts[1]
        val version = parts[2]
        if (method.isBlank() || target.isBlank() || !version.startsWith("HTTP/", ignoreCase = true)) return null
        return RequestLine(method = method, target = target, version = version)
    }

    private fun parseHttpTarget(requestTarget: String, headers: List<HttpHeader>): HttpTarget? {
        val uri = runCatching { URI(requestTarget) }.getOrNull()
        if (uri?.isAbsolute == true) {
            if (!uri.scheme.equals("http", ignoreCase = true)) return null
            val host = uri.host ?: parseAuthority(uri.rawAuthority.orEmpty(), defaultPort = 80)?.host ?: return null
            val explicitPort = uri.port != -1
            val port = if (explicitPort) uri.port else 80
            return HttpTarget(
                host = host,
                port = port,
                hostHeader = buildHostHeader(host, port, explicitPort),
                originTarget = buildOriginTarget(uri),
            )
        }

        val hostHeader = headers.lastOrNull { it.name.equals("Host", ignoreCase = true) }?.value ?: return null
        val authority = parseAuthority(hostHeader.trim(), defaultPort = 80) ?: return null
        return HttpTarget(
            host = authority.host,
            port = authority.port,
            hostHeader = hostHeader.trim(),
            originTarget = requestTarget.ifEmpty { "/" },
        )
    }

    private fun parseAuthority(authority: String, defaultPort: Int): Authority? {
        if (authority.isBlank()) return null
        val host: String
        val port: Int
        if (authority.startsWith("[")) {
            val endBracket = authority.indexOf(']')
            if (endBracket <= 1) return null
            host = authority.substring(1, endBracket)
            port = if (authority.length > endBracket + 1 && authority[endBracket + 1] == ':') {
                authority.substring(endBracket + 2).toIntOrNull() ?: return null
            } else {
                defaultPort
            }
        } else {
            val separator = authority.lastIndexOf(':').takeIf { it == authority.indexOf(':') }
            host = if (separator == null || separator < 0) authority else authority.substring(0, separator)
            port = if (separator == null || separator < 0) {
                defaultPort
            } else {
                authority.substring(separator + 1).toIntOrNull() ?: return null
            }
        }
        if (host.isBlank() || port !in 1..65535) return null
        return Authority(host = host, port = port)
    }

    private fun buildOriginTarget(uri: URI): String {
        val path = uri.rawPath?.takeIf { it.isNotEmpty() } ?: "/"
        val query = uri.rawQuery
        return if (query == null) path else "$path?$query"
    }

    private fun buildHostHeader(host: String, port: Int, explicitPort: Boolean): String {
        val formattedHost = if (host.contains(':') && !host.startsWith("[")) "[$host]" else host
        return if (explicitPort) "$formattedHost:$port" else formattedHost
    }

    private fun buildHttpRequestHead(
        requestLine: RequestLine,
        target: HttpTarget,
        headers: List<HttpHeader>,
        skipExpect: Boolean,
    ): ByteArray {
        val builder = StringBuilder()
        builder.append(requestLine.method)
            .append(' ')
            .append(target.originTarget)
            .append(' ')
            .append(requestLine.version)
            .append("\r\n")
        builder.append("Host: ").append(target.hostHeader).append("\r\n")
        headers.forEach { header ->
            val name = header.name.lowercase(Locale.US)
            if (name == "host" ||
                name == "proxy-connection" ||
                name == "connection" ||
                name == "keep-alive" ||
                name == "proxy-authorization" ||
                (skipExpect && name == "expect")
            ) {
                return@forEach
            }
            builder.append(header.name).append(": ").append(header.value).append("\r\n")
        }
        builder.append("Connection: close\r\n")
        builder.append("\r\n")
        return builder.toString().toByteArray(Charsets.ISO_8859_1)
    }

    private fun List<HttpHeader>.contentLength(): Long? {
        return lastOrNull { it.name.equals("Content-Length", ignoreCase = true) }
            ?.value
            ?.trim()
            ?.toLongOrNull()
            ?.takeIf { it >= 0 }
    }

    private fun List<HttpHeader>.isChunked(): Boolean {
        return any { header ->
            header.name.equals("Transfer-Encoding", ignoreCase = true) &&
                header.value.split(',')
                    .any { it.trim().equals("chunked", ignoreCase = true) }
        }
    }

    private fun List<HttpHeader>.expectsContinue(): Boolean {
        return any { header ->
            header.name.equals("Expect", ignoreCase = true) &&
                header.value.equals("100-continue", ignoreCase = true)
        }
    }

    private fun copyFixedLength(input: InputStream, output: OutputStream, byteCount: Long) {
        var remaining = byteCount
        val buffer = ByteArray(16 * 1024)
        while (remaining > 0) {
            val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
            if (read == -1) throw IOException("Unexpected end of request body")
            output.write(buffer, 0, read)
            remaining -= read
        }
    }

    private fun copyChunkedBody(input: InputStream, output: OutputStream) {
        while (true) {
            val sizeLine = input.readAsciiLine() ?: throw IOException("Unexpected end of chunked request body")
            writeAsciiLine(output, sizeLine)
            val size = sizeLine.substringBefore(';').trim().toLongOrNull(radix = 16)
                ?: throw IOException("Invalid chunk size")
            if (size == 0L) {
                copyTrailers(input, output)
                return
            }
            copyFixedLength(input, output, size)
            copyChunkEnding(input, output)
        }
    }

    private fun copyTrailers(input: InputStream, output: OutputStream) {
        while (true) {
            val line = input.readAsciiLine() ?: throw IOException("Unexpected end of chunk trailers")
            writeAsciiLine(output, line)
            if (line.isEmpty()) return
        }
    }

    private fun copyChunkEnding(input: InputStream, output: OutputStream) {
        val first = input.read()
        val second = input.read()
        if (first != '\r'.code || second != '\n'.code) throw IOException("Invalid chunk ending")
        output.write(first)
        output.write(second)
    }

    private fun writeAsciiLine(output: OutputStream, line: String) {
        output.write(line.toByteArray(Charsets.ISO_8859_1))
        output.write("\r\n".toByteArray(Charsets.ISO_8859_1))
    }

    private fun InputStream.copyResponseTo(output: OutputStream, onFirstByte: () -> Unit) {
        val buffer = ByteArray(16 * 1024)
        var started = false
        while (true) {
            val read = read(buffer)
            if (read == -1) break
            if (!started) {
                started = true
                onFirstByte()
            }
            output.write(buffer, 0, read)
        }
        output.flush()
    }

    private fun InputStream.readAsciiLine(): String? {
        val bytes = ArrayList<Byte>(128)
        while (true) {
            val next = read()
            if (next == -1) return if (bytes.isEmpty()) null else bytes.toByteArray().toString(Charsets.US_ASCII)
            if (next == '\n'.code) {
                if (bytes.lastOrNull() == '\r'.code.toByte()) {
                    bytes.removeAt(bytes.lastIndex)
                }
                return bytes.toByteArray().toString(Charsets.US_ASCII)
            }
            bytes += next.toByte()
        }
    }

    private fun sendContinue(socket: Socket) {
        runCatching {
            socket.getOutputStream().write("HTTP/1.1 100 Continue\r\n\r\n".toByteArray(Charsets.US_ASCII))
            socket.getOutputStream().flush()
        }
    }

    private fun sendSimpleResponse(socket: Socket, statusCode: Int, reason: String) {
        runCatching {
            socket.getOutputStream().write(
                "HTTP/1.1 $statusCode $reason\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
                    .toByteArray(Charsets.US_ASCII),
            )
            socket.getOutputStream().flush()
        }
    }

    private fun trackSocket(socket: Socket): Socket {
        activeSockets += socket
        if (!running.get()) {
            runCatching { socket.close() }
        }
        return socket
    }

    private fun closeAndForget(socket: Socket) {
        runCatching { socket.close() }
        activeSockets.remove(socket)
    }

    private fun InputStream.copyToAndClose(
        output: OutputStream,
        upstream: Socket,
        client: Socket,
    ) {
        runCatching {
            copyTo(output, bufferSize = 16 * 1024)
            output.flush()
        }
        runCatching { upstream.close() }
        runCatching { client.close() }
    }

    private fun reportState(message: String) {
        lastProxyEvent = message
        Log.d(TAG, message)
    }

    /**
     * 供 WebViewClient 等外部回调写诊断用。
     * onReceivedSslError 内部不能直接动 private 的 reportState，借此入口把每次
     * 信任决策（proceed / cancel + host + 原因）落到统一的事件流里。
     */
    fun noteWebViewEvent(message: String) {
        reportState(message)
    }

    private fun reportError(stage: String, throwable: Throwable) {
        val chain = buildString {
            var current: Throwable? = throwable
            var depth = 0
            while (current != null && depth < 4) {
                if (isNotEmpty()) append(" <= ")
                append(current.javaClass.simpleName)
                current.message?.takeIf { it.isNotBlank() }?.let {
                    append(": ").append(it)
                }
                current = current.cause
                depth += 1
            }
        }
        val summary = "$stage: $chain"
        lastProxyError = summary
        Log.e(TAG, summary, throwable)
    }

    private data class RequestLine(
        val method: String,
        val target: String,
        val version: String,
    )

    private data class HttpHeader(
        val name: String,
        val value: String,
    )

    private data class Authority(
        val host: String,
        val port: Int,
    )

    private data class HttpTarget(
        val host: String,
        val port: Int,
        val hostHeader: String,
        val originTarget: String,
    )

    private data class MitmRequest(
        val method: String,
        val path: String,
        val startedAt: Long,
    )

    companion object {
        // 所有 pixiv 自家域名一律 MITM——透明 CONNECT 会被 GFW 的 SNI DPI 直接 RST，
        // 5 秒拨号反复超时就是用户报的"大量等待"。靠白名单穷举子域（embed / fanbox 商品页
        // / 新拆出来的子站）永远赶不上运营节奏，按 eTLD+1 后缀放行更稳。
        // d.pixiv.org 单独列：是 pixiv 自家但 TLD 不一样。被 BLOCKED_EXACT_HOSTS 拦下来的
        // a.pixiv.org / lc-event.pixiv.net 已经在 isBlockedHost 阶段 502 短路，不会落到这里。
        val MITM_HOST_SUFFIXES: List<String> = listOf(
            "pixiv.net",
            "pximg.net",
            "pixivsketch.net",
        )

        val MITM_EXACT_HOSTS: Set<String> = setOf(
            "d.pixiv.org",
        )

        // 把 reCAPTCHA 的入口域改投到 recaptcha.net——Google 为被 GFW 屏蔽的地区准备的官方
        // 替身域名。只换 TCP 拨号目标，client 看到的 URL/Host 仍然是 www.google.com；
        // recaptcha.net 后端会按原路径服务相同的脚本，登录就不会卡在人机验证。
        // 证书不匹配由 WebView 的 onReceivedSslError -> proceed() 兜底。
        val HOST_REWRITES: Map<String, String> = mapOf(
            "www.google.com" to "www.recaptcha.net",
            "google.com" to "www.recaptcha.net",
            "recaptcha.google.com" to "www.recaptcha.net",
        )

        // pixiv 页面里夹带的广告 / 统计 / 社交分享，墙内都拨不通；让透明隧道去试就是 20 秒
        // 起步的超时，单条页面要等好几次。直接 502 短路，DOMContentLoaded 后的子资源就能立刻
        // 结束。reCAPTCHA 用的 gstatic / googleapis 不进这张表，留给系统 DNS 自己试。
        val BLOCKED_HOST_SUFFIXES: List<String> = listOf(
            "google-analytics.com",
            "googletagmanager.com",
            "googletagservices.com",
            "googleadservices.com",
            "googlesyndication.com",
            "doubleclick.net",
            "criteo.com",
            "criteo.net",
            "ads-pixiv.net",
            "facebook.com",
            "facebook.net",
            "fbcdn.net",
            "twitter.com",
            "twimg.com",
            "t.co",
        )

        // 精准匹配。*.google.com 不能整段砍——www.google.com 留给 reCAPTCHA 改写；
        // a.pixiv.org / lc-event.pixiv.net 属于在主域下的分析端点，suffix 表会误伤
        // pixiv.net 主体，必须按完整 host 拦。
        // content-autofill.googleapis.com 是 WebView 自动填充的探测请求，登录页每次
        // 加载会连打 3 次透明隧道、每次 5s 超时，502 短路省时间。
        val BLOCKED_EXACT_HOSTS: Set<String> = setOf(
            "fundingchoicesmessages.google.com",
            "adservice.google.com",
            "pagead.googlesyndication.com",
            "a.pixiv.org",
            "lc-event.pixiv.net",
            "content-autofill.googleapis.com",
        )

        val secureRandom = SecureRandom()

        private val inMemoryCertificateAuthority: CertificateAuthority by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
            stage("generate in-memory ca") {
                val keyPair = stage("build ca keypair") { generateKeyPair() }
                val subject = X500Name("CN=Pixiv Login Proxy CA")
                val notBefore = Date(System.currentTimeMillis() - 24L * 60L * 60L * 1000L)
                val notAfter = Date(System.currentTimeMillis() + 3650L * 24L * 60L * 60L * 1000L)
                val builder = JcaX509v3CertificateBuilder(
                    subject,
                    randomSerialNumber(),
                    notBefore,
                    notAfter,
                    subject,
                    keyPair.public,
                )
                builder.addExtension(Extension.basicConstraints, true, BasicConstraints(true))
                builder.addExtension(
                    Extension.keyUsage,
                    true,
                    KeyUsage(KeyUsage.keyCertSign or KeyUsage.cRLSign),
                )
                builder.addExtension(
                    Extension.subjectKeyIdentifier,
                    false,
                    extensionUtils.createSubjectKeyIdentifier(keyPair.public),
                )
                val signer = stage("build ca signer") { buildContentSigner(keyPair.private) }
                val holder = stage("build ca certificate holder") { builder.build(signer) }
                val certificate = stage("convert ca certificate") { convertCertificate(holder) }
                stage("verify in-memory ca certificate") { certificate.verify(certificate.publicKey) }
                CertificateAuthority(privateKey = keyPair.private, certificate = certificate)
            }
        }

        val permissiveTrustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        }

        val extensionUtils by lazy {
            JcaX509ExtensionUtils()
        }

        val clientSslContext: SSLContext by lazy {
            SSLContext.getInstance("TLS").apply {
                init(null, arrayOf<TrustManager>(permissiveTrustManager), SecureRandom())
            }
        }

        fun generateKeyPair(): KeyPair {
            val generator = KeyPairGenerator.getInstance("RSA")
            generator.initialize(2048, secureRandom)
            return generator.generateKeyPair()
        }

        fun randomSerialNumber(): java.math.BigInteger {
            return java.math.BigInteger(128, secureRandom).abs()
        }

        fun isMitmHost(host: String?): Boolean {
            val normalized = normalizeHost(host) ?: return false
            if (normalized in MITM_EXACT_HOSTS) return true
            return MITM_HOST_SUFFIXES.any { suffix ->
                normalized == suffix || normalized.endsWith(".$suffix")
            }
        }

        fun rewriteHost(host: String?): String? {
            val normalized = normalizeHost(host) ?: return null
            return HOST_REWRITES[normalized]
        }

        fun isBlockedHost(host: String?): Boolean {
            val normalized = normalizeHost(host) ?: return false
            if (normalized in BLOCKED_EXACT_HOSTS) return true
            return BLOCKED_HOST_SUFFIXES.any { suffix ->
                normalized == suffix || normalized.endsWith(".$suffix")
            }
        }

        fun normalizeHost(host: String?): String? {
            return host?.trim()?.lowercase(Locale.US)?.removeSuffix(".")?.takeIf { it.isNotEmpty() }
        }

        val bundledBouncyCastleProvider: Provider by lazy {
            BouncyCastleProvider()
        }

        fun ensureBouncyCastle() {
            val existing = Security.getProvider(BOUNCY_CASTLE_PROVIDER)
            if (existing == null || existing.javaClass.name != bundledBouncyCastleProvider.javaClass.name) {
                existing?.let { Security.removeProvider(BOUNCY_CASTLE_PROVIDER) }
                Security.insertProviderAt(bundledBouncyCastleProvider, 1)
            }
        }

        fun convertCertificate(holder: X509CertificateHolder): X509Certificate {
            ensureBouncyCastle()
            val attempts = listOf(
                { JcaX509CertificateConverter().setProvider(bundledBouncyCastleProvider).getCertificate(holder) },
                { JcaX509CertificateConverter().getCertificate(holder) },
            )
            var lastError: Throwable? = null
            attempts.forEach { attempt ->
                try {
                    return attempt()
                } catch (throwable: Throwable) {
                    lastError = throwable
                }
            }
            throw lastError ?: IllegalStateException("Unable to create certificate converter")
        }

        fun buildContentSigner(privateKey: PrivateKey): ContentSigner {
            ensureBouncyCastle()
            val attempts = listOf(
                { JcaContentSignerBuilder("SHA256withRSA").setProvider(bundledBouncyCastleProvider).build(privateKey) },
                { JcaContentSignerBuilder("SHA256withRSA").build(privateKey) },
                { JcaContentSignerBuilder("SHA256WithRSAEncryption").setProvider(bundledBouncyCastleProvider).build(privateKey) },
                { JcaContentSignerBuilder("SHA256WithRSAEncryption").build(privateKey) },
            )
            var lastError: Throwable? = null
            attempts.forEach { attempt ->
                try {
                    return attempt()
                } catch (throwable: Throwable) {
                    lastError = throwable
                }
            }
            throw lastError ?: IllegalStateException("Unable to create content signer")
        }

        inline fun <T> stage(label: String, block: () -> T): T {
            lastProxyEvent = label
            return try {
                block()
            } catch (throwable: Throwable) {
                throw IllegalStateException(label, throwable)
            }
        }

        const val BOUNCY_CASTLE_PROVIDER = "BC"
        const val TAG = "LocalLoginProxy"

        @Volatile
        var lastProxyError: String? = null

        @Volatile
        var lastProxyEvent: String? = null

        data class CertificateAuthority(
            val privateKey: PrivateKey,
            val certificate: X509Certificate,
        )
    }
}
