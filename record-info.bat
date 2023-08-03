@echo off
setlocal enableextensions
setlocal enabledelayedexpansion

echo Retrieving system information...
set "sysinfo="

for /f "tokens=*" %%a in ('systeminfo') do set sysinfo=!sysinfo! %%a

set serial=

for /f "tokens=3" %%a in ('wmic bios get serialnumber /value ^| findstr /r /c:"^SerialNumber="') do set serial=%%a

echo Uploading to Google Sheets...
set "CREDENTIALS_FILE=your-credentials-file.json"
set "SPREADSHEET_ID=https://docs.google.com/spreadsheets/d/1ytGSHygNNidsKA561Gccb44yFuxhHK1uqo-KidRVwgk/edit#gid=0"

set "ACCESS_TOKEN_FILE=access_token.json"
set "REFRESH_TOKEN_FILE=refresh_token.json"

set "CLIENT_SECRET_FILE=client_secret.json"
set "SCOPE=https://www.googleapis.com/auth/spreadsheets"

if not exist %ACCESS_TOKEN_FILE% (
  if not exist %REFRESH_TOKEN_FILE% (
    google-oauthlib-tool --client-secrets=%CLIENT_SECRET_FILE% --scope=%SCOPE% --save
  ) else (
    google-oauthlib-tool --client-secrets=%CLIENT_SECRET_FILE% --scope=%SCOPE% --refresh-token=%REFRESH_TOKEN_FILE% --save
  )
)

set "ACCESS_TOKEN=$(cat %ACCESS_TOKEN_FILE%)"

set "API_REQUEST_BODY={\"values\":[[\"%sysinfo%\",\"%serial%\"]]}"

curl --request POST --header "Authorization: Bearer %ACCESS_TOKEN%" --header 'Content-Type: application/json' --data '%API_REQUEST_BODY%' https://sheets.googleapis.com/v4/spreadsheets/%SPREADSHEET_ID%/values/Sheet1!A2:B2:append?valueInputOption=RAW

echo Done.
pause
