using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

internal static class Installer {
    private static int Main(string[] args) {
        string folder = Path.Combine(Path.GetTempPath(), "Codi-Setup-" + Guid.NewGuid().ToString("N"));
        try {
            Directory.CreateDirectory(folder);
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("Codi.Payload")) {
                if (resource == null) throw new InvalidOperationException("Installer payload is missing.");
                using (FileStream output = File.Create(Path.Combine(folder, "payload.zip"))) resource.CopyTo(output);
            }
            ZipFile.ExtractToDirectory(Path.Combine(folder, "payload.zip"), folder);
            string script = Path.Combine(folder, "app", "scripts", "install-package.ps1");
            if (!File.Exists(script)) throw new InvalidOperationException("Installer script is missing.");
            string command = "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\" -PayloadRoot \"" + folder + "\"";
            if (Array.Exists(args, item => item == "--verify-only")) command += " -VerifyOnly";
            ProcessStartInfo start = new ProcessStartInfo("powershell.exe", command);
            start.UseShellExecute = false;
            start.CreateNoWindow = false;
            using (Process process = Process.Start(start)) {
                process.WaitForExit();
                if (process.ExitCode != 0) {
                    if (!Array.Exists(args, item => item == "--verify-only")) MessageBox.Show("Codi 安装未完成。请查看上方错误信息。\nCodi installation did not complete.", "Codi Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return process.ExitCode;
                }
            }
            if (Array.Exists(args, item => item == "--verify-only")) return 0;
            MessageBox.Show("Codi 已安装。请完全退出并重新打开 Codex，然后新建聊天。\nCodi is installed. Restart Codex and open a new chat.", "Codi Setup", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error);
            if (!Array.Exists(args, item => item == "--verify-only")) MessageBox.Show(error.Message, "Codi Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        } finally {
            try { Directory.Delete(folder, true); } catch { }
        }
    }
}
