# ============================================
# 안드로이드 APK 빌드 환경 자동 설치 스크립트
# PowerShell 관리자 권한으로 실행하세요
# ============================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " 안드로이드 개발환경 자동 설치" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

# --- 1. Java JDK 17 ---
Write-Host "`n[1/6] Java JDK 17 설치 중..." -ForegroundColor Yellow
$jdkPath = "C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot"
if (Test-Path "$jdkPath\bin\java.exe") {
    Write-Host "  이미 설치됨 - 건너뜀" -ForegroundColor Green
} else {
    $jdkMsi = "$env:TEMP\openjdk17.msi"
    Invoke-WebRequest -Uri 'https://aka.ms/download-jdk/microsoft-jdk-17.0.18-windows-x64.msi' -OutFile $jdkMsi
    Start-Process msiexec.exe -ArgumentList "/i $jdkMsi ADDLOCAL=FeatureMain,FeatureEnvironment,FeatureJarFileRunWith,FeatureJavaHome /quiet" -Verb RunAs -Wait
    Write-Host "  완료!" -ForegroundColor Green
}

# --- 2. Android SDK 명령줄 도구 ---
Write-Host "`n[2/6] Android SDK 명령줄 도구 설치 중..." -ForegroundColor Yellow
$sdkHome = "$env:USERPROFILE\Android\Sdk"
$sdkmanager = "$sdkHome\cmdline-tools\latest\bin\sdkmanager.bat"
if (Test-Path $sdkmanager) {
    Write-Host "  이미 설치됨 - 건너뜀" -ForegroundColor Green
} else {
    $zipPath = "$env:TEMP\cmdline-tools.zip"
    Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' -OutFile $zipPath
    New-Item -ItemType Directory -Path "$sdkHome\cmdline-tools" -Force | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath "$sdkHome\cmdline-tools" -Force
    Rename-Item "$sdkHome\cmdline-tools\cmdline-tools" "$sdkHome\cmdline-tools\latest"
    Write-Host "  완료!" -ForegroundColor Green
}

# --- 3. 환경변수 설정 ---
Write-Host "`n[3/6] 환경변수 설정 중..." -ForegroundColor Yellow
[System.Environment]::SetEnvironmentVariable('JAVA_HOME', $jdkPath, 'User')
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdkHome, 'User')
$env:JAVA_HOME = $jdkPath
$env:ANDROID_HOME = $sdkHome
Write-Host "  JAVA_HOME = $jdkPath" -ForegroundColor Green
Write-Host "  ANDROID_HOME = $sdkHome" -ForegroundColor Green

# --- 4. SDK 컴포넌트 설치 ---
Write-Host "`n[4/6] SDK 컴포넌트 설치 중 (플랫폼, 빌드도구)..." -ForegroundColor Yellow
echo y | & $sdkmanager --no_https --licenses 2>$null
& $sdkmanager --no_https "platforms;android-34" "platforms;android-36" "build-tools;34.0.0" "build-tools;35.0.0" "build-tools;36.0.0" "platform-tools"
Write-Host "  완료!" -ForegroundColor Green

# --- 5. Android NDK ---
Write-Host "`n[5/6] Android NDK 설치 중 (약 780MB, 시간 소요)..." -ForegroundColor Yellow
$ndkPath = "$sdkHome\ndk\27.1.12297006"
if (Test-Path "$ndkPath\source.properties") {
    Write-Host "  이미 설치됨 - 건너뜀" -ForegroundColor Green
} else {
    $ndkZip = "$env:TEMP\ndk.zip"
    Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/android-ndk-r27b-windows.zip' -OutFile $ndkZip
    New-Item -ItemType Directory -Path "$sdkHome\ndk" -Force | Out-Null
    Expand-Archive -Path $ndkZip -DestinationPath "$sdkHome\ndk\temp" -Force
    Move-Item "$sdkHome\ndk\temp\android-ndk-r27b" $ndkPath
    Remove-Item "$sdkHome\ndk\temp" -Force -ErrorAction SilentlyContinue
    Write-Host "  완료!" -ForegroundColor Green
}

# --- 6. Gradle SSL 우회 설정 ---
Write-Host "`n[6/6] Gradle SSL 프록시 설정 중..." -ForegroundColor Yellow

# gradle.properties
$gradleDir = "$env:USERPROFILE\.gradle"
if (!(Test-Path $gradleDir)) { New-Item -ItemType Directory -Path $gradleDir -Force | Out-Null }
Set-Content "$gradleDir\gradle.properties" "org.gradle.jvmargs=-Xmx2048m`n"

# init.d/ssl-fix.gradle
$initDir = "$gradleDir\init.d"
if (!(Test-Path $initDir)) { New-Item -ItemType Directory -Path $initDir -Force | Out-Null }
$sslFix = @'
settingsEvaluated { settings ->
    settings.pluginManagement {
        repositories {
            clear()
            mavenLocal()
            maven {
                url 'http://localhost:8888'
                allowInsecureProtocol = true
            }
        }
    }
}
allprojects {
    buildscript {
        repositories {
            clear()
            mavenLocal()
            maven {
                url 'http://localhost:8888'
                allowInsecureProtocol = true
            }
        }
    }
    repositories {
        clear()
        mavenLocal()
        maven {
            url 'http://localhost:8888'
            allowInsecureProtocol = true
        }
    }
}
'@
Set-Content "$initDir\ssl-fix.gradle" $sslFix
Write-Host "  완료!" -ForegroundColor Green

# --- 완료 ---
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " 설치 완료!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "빌드 방법:" -ForegroundColor White
Write-Host "  1. node maven-proxy.js   (프록시 서버 시작)" -ForegroundColor Gray
Write-Host "  2. gradlew assembleRelease --no-daemon   (APK 빌드)" -ForegroundColor Gray
Write-Host ""
Write-Host "APK 위치: android\app\build\outputs\apk\release\app-release.apk" -ForegroundColor Gray
