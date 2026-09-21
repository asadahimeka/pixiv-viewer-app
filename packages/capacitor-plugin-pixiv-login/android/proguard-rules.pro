# Keep BouncyCastle provider classes used via reflection
-keep class org.bouncycastle.jce.provider.BouncyCastleProvider { *; }
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**
