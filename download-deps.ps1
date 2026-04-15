[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$baseUrl = "https://repo.maven.apache.org/maven2"
$cacheDir = "$env:USERPROFILE\.gradle\caches\modules-2\files-2.1"

$deps = @(
    "org/jetbrains/kotlin/kotlin-gradle-plugin/2.1.20/kotlin-gradle-plugin-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-gradle-plugin/2.1.20/kotlin-gradle-plugin-2.1.20-gradle85.jar",
    "org/jetbrains/kotlin/kotlin-gradle-plugin-api/2.1.20/kotlin-gradle-plugin-api-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-gradle-plugin-api/2.1.20/kotlin-gradle-plugin-api-2.1.20-gradle85.jar",
    "org/jetbrains/kotlin/kotlin-gradle-plugin-idea/2.1.20/kotlin-gradle-plugin-idea-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-gradle-plugin-idea-proto/2.1.20/kotlin-gradle-plugin-idea-proto-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-native-utils/2.1.20/kotlin-native-utils-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-daemon-client/2.1.20/kotlin-daemon-client-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-util-klib/2.1.20/kotlin-util-klib-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-util-klib-metadata/2.1.20/kotlin-util-klib-metadata-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-klib-commonizer-api/2.1.20/kotlin-klib-commonizer-api-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-build-statistics/2.1.20/kotlin-build-statistics-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-tooling-core/2.1.20/kotlin-tooling-core-2.1.20.jar",
    "org/jetbrains/kotlin/fus-statistics-gradle-plugin/2.1.20/fus-statistics-gradle-plugin-2.1.20.jar",
    "org/jetbrains/kotlin/fus-statistics-gradle-plugin/2.1.20/fus-statistics-gradle-plugin-2.1.20-gradle85.jar",
    "org/jetbrains/kotlin/kotlin-compiler-embeddable/2.1.20/kotlin-compiler-embeddable-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-stdlib/2.1.20/kotlin-stdlib-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-reflect/2.1.20/kotlin-reflect-2.1.20.jar",
    "org/jetbrains/kotlin/kotlin-script-runtime/2.1.20/kotlin-script-runtime-2.1.20.jar",
    "org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/1.8.0/kotlinx-coroutines-core-jvm-1.8.0.jar",
    "com/google/code/gson/gson/2.11.0/gson-2.11.0.jar",
    "com/google/errorprone/error_prone_annotations/2.27.0/error_prone_annotations-2.27.0.jar"
)

$localRepo = "C:\Users\KKH\.m2\repository"

foreach ($dep in $deps) {
    $url = "$baseUrl/$dep"
    $localPath = "$localRepo\$($dep -replace '/', '\')"
    $dir = Split-Path $localPath -Parent

    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    if (!(Test-Path $localPath)) {
        Write-Host "Downloading: $dep"
        try {
            Invoke-WebRequest -Uri $url -OutFile $localPath -ErrorAction Stop
            Write-Host "  OK" -ForegroundColor Green
        } catch {
            Write-Host "  FAILED: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "Already exists: $dep"
    }
}

Write-Host "`nDone!" -ForegroundColor Cyan
