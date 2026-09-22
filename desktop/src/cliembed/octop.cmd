@echo off
setlocal EnableExtensions

if not defined OCTOP_HOME set "OCTOP_HOME=%USERPROFILE%\.octop"
if exist "%OCTOP_HOME%\venv\Scripts\octop.exe" (
  "%OCTOP_HOME%\venv\Scripts\octop.exe" %*
  exit /b %ERRORLEVEL%
)

set "ROOT=%OCTOP_HOME%\portable"
set "PY=%ROOT%\runtime\python.exe"
if not exist "%PY%" set "PY=%ROOT%\runtime\bin\python3.exe"
if not exist "%PY%" (
  echo Octop CLI: desktop runtime not found at %ROOT% 1>&2
  echo Start the Octop desktop app once to unpack it, or reinstall. 1>&2
  exit /b 1
)
if not exist "%ROOT%\launch.py" (
  echo Octop CLI: launch.py missing under %ROOT% 1>&2
  echo Start the Octop desktop app once to unpack it, or reinstall. 1>&2
  exit /b 1
)

set "PYTHONNOUSERSITE=1"
set "PYTHONPATH="
set "OCTOP_GREEN_PACKAGES=%ROOT%\packages"
"%PY%" "%ROOT%\launch.py" %*
exit /b %ERRORLEVEL%
