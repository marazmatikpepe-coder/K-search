; Регистрация K-search как браузера Windows (ссылки, PDF, HTML, картинки)
!macro customInstall
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch" "" "K-search"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities" "ApplicationName" "K-search"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities" "ApplicationDescription" "Лёгкий браузер K-search"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities\URLAssociations" "http" "KSearchURL"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities\URLAssociations" "https" "KSearchURL"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities\FileAssociations" ".htm" "KSearchFile"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities\FileAssociations" ".html" "KSearchFile"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities\FileAssociations" ".pdf" "KSearchFile"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities\FileAssociations" ".svg" "KSearchFile"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities\FileAssociations" ".webp" "KSearchFile"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities\FileAssociations" ".png" "KSearchFile"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities\FileAssociations" ".jpg" "KSearchFile"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities\FileAssociations" ".jpeg" "KSearchFile"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\KSearch\Capabilities\FileAssociations" ".gif" "KSearchFile"
  WriteRegStr HKCU "Software\RegisteredApplications" "KSearch" "Software\Clients\StartMenuInternet\KSearch\Capabilities"
  WriteRegStr HKCU "Software\Classes\KSearchURL" "" "K-search URL"
  WriteRegStr HKCU "Software\Classes\KSearchURL" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\KSearchURL\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\KSearchURL\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\KSearchFile" "" "K-search document"
  WriteRegStr HKCU "Software\Classes\KSearchFile\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\KSearchFile\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\KSearch"
  DeleteRegValue HKCU "Software\RegisteredApplications" "KSearch"
  DeleteRegKey HKCU "Software\Classes\KSearchURL"
  DeleteRegKey HKCU "Software\Classes\KSearchFile"
!macroend
