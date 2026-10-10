param([long]$Owner)
$ErrorActionPreference='Stop'
$OutputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=$OutputEncoding
[Console]::InputEncoding=$OutputEncoding
$initial=[Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition 'public class DialogueOwner : System.Windows.Forms.IWin32Window { public System.IntPtr Handle {get;private set;} public DialogueOwner(long hwnd){Handle=new System.IntPtr(hwnd);} }' -ReferencedAssemblies System.Windows.Forms
$en=$initial.language -eq 'en-US'
$form=New-Object Windows.Forms.Form
$form.Text=if($en){'Edit dialogue'}else{'编辑点击对话'}
$form.ClientSize=New-Object Drawing.Size(540,410)
$form.StartPosition='CenterParent';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.MinimizeBox=$false;$form.ShowInTaskbar=$false
$form.Font=New-Object Drawing.Font('Microsoft YaHei UI',10)
$names=if($en){@('Address','First dialogue','Second dialogue')}else{@('称呼','第一段对话','第二段对话')}
$values=@($initial.preferences.address,$initial.preferences.lines[0],$initial.preferences.lines[1])
$inputs=@()
for($i=0;$i -lt 3;$i++){
  $label=New-Object Windows.Forms.Label;$label.Text=$names[$i];$label.SetBounds(20,@(16,82,208)[$i],490,26);$form.Controls.Add($label)
  $input=New-Object Windows.Forms.TextBox;$input.Text=$values[$i];$input.SetBounds(20,@(44,110,236)[$i],500,@(30,90,90)[$i]);$input.MaxLength=if($i -eq 0){32}else{240}
  if($i -gt 0){$input.Multiline=$true;$input.ScrollBars='Vertical';$input.AcceptsReturn=$true}
  $form.Controls.Add($input);$inputs+= $input
}
$hint=New-Object Windows.Forms.Label;$hint.Text='{称呼} · {剩余额度} · {重置时间} · {重置卡次数}';$hint.SetBounds(20,332,510,24);$form.Controls.Add($hint)
$save=New-Object Windows.Forms.Button;$save.Text=if($en){'Save'}else{'保存'};$save.SetBounds(340,366,86,30);$save.DialogResult='OK';$form.Controls.Add($save)
$cancel=New-Object Windows.Forms.Button;$cancel.Text=if($en){'Cancel'}else{'取消'};$cancel.SetBounds(434,366,86,30);$cancel.DialogResult='Cancel';$form.Controls.Add($cancel);$form.CancelButton=$cancel
$result=$form.ShowDialog((New-Object DialogueOwner($Owner)))
if($result -eq 'OK'){@{address=$inputs[0].Text;lines=@($inputs[1].Text,$inputs[2].Text)} | ConvertTo-Json -Compress | ForEach-Object {[Console]::WriteLine($_)}}
$form.Dispose()
