' CVForge launcher (Windows). Double-click starts the bundled server with no
' console window and opens the browser; if CVForge is already running it just
' reopens the browser. Quitting lives in the app: the nav's "apagar".
Option Explicit
Dim fso, sh, env, http, root, port, url, running, i
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
port = "3000"
url = "http://localhost:" & port

' Already running? The icon route carries the app's name — a cheap identity
' check so we never open the browser onto some other server on the port.
running = False
On Error Resume Next
Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
http.Open "GET", url & "/icon.svg", False
http.SetTimeouts 2000, 2000, 2000, 2000
http.Send
If Err.Number = 0 And http.Status = 200 Then
  If InStr(http.ResponseText, "CVForge") > 0 Then running = True
End If
On Error GoTo 0

If Not running Then
  If Not fso.FolderExists(root & "\datos") Then fso.CreateFolder root & "\datos"
  Set env = sh.Environment("PROCESS")
  env("PORT") = port
  env("HOSTNAME") = "127.0.0.1"
  env("CVFORGE_DB_PATH") = root & "\datos\cvforge.db"
  sh.CurrentDirectory = root & "\programa\servidor"
  sh.Run """" & root & "\programa\node\win-x64\node.exe"" server.js", 0, False
  For i = 1 To 120
    WScript.Sleep 500
    On Error Resume Next
    http.Open "GET", url, False
    http.SetTimeouts 2000, 2000, 2000, 2000
    http.Send
    If Err.Number = 0 And http.Status = 200 Then Exit For
    On Error GoTo 0
  Next
End If

sh.Run url
