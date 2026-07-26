@echo off
REM Double-click me after dropping a new Riser_Chart_Manager.html into this folder.
REM The served app is a byte-for-byte copy of the canonical file.
REM NEVER edit app\index.html directly - this overwrites it with no warning.
copy /Y "Riser_Chart_Manager.html" "app\index.html" >nul
if errorlevel 1 (
  echo FAILED - is Riser_Chart_Manager.html in this folder?
  pause
  exit /b 1
)
fc /B "Riser_Chart_Manager.html" "app\index.html" >nul
if errorlevel 1 (
  echo FAILED - the copy does not match.
  pause
  exit /b 1
)
echo Synced: app\index.html is identical to Riser_Chart_Manager.html
findstr /C:"const APP_VERSION=" "Riser_Chart_Manager.html"
echo.
echo Now commit and push in GitHub Desktop.
pause
