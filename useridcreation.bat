@echo off
:start
set username=Please Enter A UserName:jodoadmin
set password=Enter A Password:jodo
net user %username% /add %password%
net localgroup Administrators jodoadmin /add
echo done
pause
exit