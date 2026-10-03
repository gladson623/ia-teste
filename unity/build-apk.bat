@echo off
rem Gera Builds\MordomoVR.apk sem abrir o Unity (feche o editor antes de rodar).
rem TEMP e redirecionado porque, neste PC, o Java do Gradle falha com
rem "Unable to establish loopback connection" ao usar a pasta Temp padrao do Windows.
setlocal
set "PROJECT=%~dp0"
if not exist "%PROJECT%Logs\buildtmp" mkdir "%PROJECT%Logs\buildtmp"
set "TEMP=%PROJECT%Logs\buildtmp"
set "TMP=%PROJECT%Logs\buildtmp"
"C:\Program Files\Unity\Hub\Editor\6000.6.3f1\Editor\Unity.exe" -batchmode -quit -projectPath "%PROJECT%." -buildTarget Android -executeMethod Mordomo.EditorTools.MordomoProjectSetup.BuildApk -logFile "%PROJECT%Logs\build.log"
if errorlevel 1 (
  echo Build falhou. Veja Logs\build.log
  exit /b 1
)
echo APK gerado em Builds\MordomoVR.apk
