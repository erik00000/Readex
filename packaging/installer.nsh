; Remove only files present in the clean bundle; preserve data/ and other user files.
!include "${PROJECT_DIR}\packaging\installed-files.generated.nsh"

!ifndef BUILD_UNINSTALLER
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE ReadexModeLeave
!endif

!macro customHeader
  !ifndef BUILD_UNINSTALLER

    Function ReadexDefaultDirectory
      ${If} $hasPerUserInstallation == "0"
      ${AndIf} $hasPerMachineInstallation == "0"
        !insertmacro GetDParameter $R0
        ${If} $R0 == ""
          IfFileExists "D:\*.*" 0 +2
          StrCpy $INSTDIR "D:\Readex"
        ${EndIf}
      ${EndIf}
    FunctionEnd

    Function ReadexModeLeave
      Call ReadexDefaultDirectory
    FunctionEnd
  !endif
!macroend

!macro customInit
  Call ReadexDefaultDirectory
!macroend
