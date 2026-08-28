#!/usr/bin/env bash
set -e

echo "🚀 Compilando APK de RNV Manager para Android..."

# 1. Configurar variables de entorno
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$PATH"

JAVA_BIN="$JAVA_HOME/bin/java"
echo "☕ Java: $($JAVA_BIN -version 2>&1 | head -n 1)"
echo "📱 Android SDK: $ANDROID_HOME"

# 2. Sincronizar Capacitor
npx cap sync android

# 3. Compilar APK con Gradle
cd android
chmod +x ./gradlew
./gradlew assembleDebug

# 4. Copiar APK a carpeta de distribución
cd ..
mkdir -p dist-android
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

if [ -f "$APK_PATH" ]; then
    cp "$APK_PATH" dist-android/rnv-manager.apk
    echo "✅ APK generado exitosamente en: dist-android/rnv-manager.apk"
    ls -lh dist-android/rnv-manager.apk
else
    echo "❌ Error: No se encontró el archivo APK generado."
    exit 1
fi
