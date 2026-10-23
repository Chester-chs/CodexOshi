$ErrorActionPreference='Stop'
$source=Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Path (Join-Path $source 'desktop\WindowApi.cs')
Add-Type -Path (Join-Path $PSScriptRoot 'MouseProbe.cs')
$forms=@()
$original=[QuotaMouseProbe]::Foreground()
try {
    foreach($name in @('Host','Owned overlay','Foreign app','Owned dialog')) {
        $form=New-Object Windows.Forms.Form
        $form.Text='CodexOshi foreground fixture: '+$name
        $form.Width=240;$form.Height=120;$form.ShowInTaskbar=$false
        $forms+=,$form
    }
    $hostForm=$forms[0];$overlay=$forms[1];$foreign=$forms[2];$dialog=$forms[3]
    $overlay.Owner=$hostForm;$dialog.Owner=$overlay
    foreach($form in $forms){$form.Show()}
    [Windows.Forms.Application]::DoEvents()
    foreach($item in @(
        @{form=$hostForm;expected=$true;name='host'},
        @{form=$overlay;expected=$true;name='owned-overlay'},
        @{form=$dialog;expected=$true;name='owned-dialog'},
        @{form=$foreign;expected=$false;name='unrelated-window'},
        @{form=$hostForm;expected=$true;name='return-to-host'}
    )) {
        if(-not [QuotaMouseProbe]::ActivateHost($item.form.Handle.ToInt64())){throw ('Could not activate fixture '+$item.name)}
        [Windows.Forms.Application]::DoEvents()
        # Drain queued WinForms activation before sampling the exact target.
        if([QuotaMouseProbe]::Foreground() -ne $item.form.Handle.ToInt64()){
            if(-not [QuotaMouseProbe]::ActivateHost($item.form.Handle.ToInt64())){throw ('Fixture activation changed: '+$item.name)}
        }
        if([QuotaWindows]::ForegroundWithin($hostForm.Handle.ToInt64()) -ne $item.expected){
            foreach($form in $forms){[QuotaWindows]::Audit($form.Handle.ToInt64())|ConvertTo-Json -Depth 4 -Compress}
            throw ('Incorrect foreground classification: '+$item.name)
        }
    }
    if([QuotaWindows]::ForegroundWithin(0)){throw 'No host was classified active.'}
    Write-Output '{"check":"real-Windows-foreground-ownership","cases":6,"passed":true}'
} finally {
    for($i=$forms.Count-1;$i -ge 0;$i--){$forms[$i].Close();$forms[$i].Dispose()}
    if($original -ne 0){[QuotaMouseProbe]::ActivateHost($original)|Out-Null}
}
