using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

// Per-user supervisor. Reads window/process metadata; never reads chat contents.
public static class QuotaWindows {
    // Read-only acceptance evidence; does not drive or activate any window.
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Rect r);
    [DllImport("gdi32.dll")] static extern IntPtr CreateRectRgn(int x, int y, int right, int bottom);
    [DllImport("user32.dll")] static extern int GetWindowRgn(IntPtr h, IntPtr region);
    [DllImport("gdi32.dll")] static extern int GetRgnBox(IntPtr region, out Rect bounds);
    [DllImport("gdi32.dll")] static extern bool PtInRegion(IntPtr region, int x, int y);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr value);
    public static object Audit(long value) {
        IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
        try { return AuditPhysical(value); }
        finally { if (previous != IntPtr.Zero) SetThreadDpiAwarenessContext(previous); }
    }
    static object AuditPhysical(long value) {
        var h = new IntPtr(value); Rect bounds, regionBounds;
        GetWindowRect(h, out bounds);
        var region = CreateRectRgn(0, 0, 0, 0);
        try {
            int kind = GetWindowRgn(h, region); GetRgnBox(region, out regionBounds);
            return new { window=value.ToString(), owner=GetWindow(h,4).ToInt64().ToString(),
                foreground=GetForegroundWindow().ToInt64().ToString(), visible=IsWindowVisible(h),
                extendedStyle=GetWindowLongPtr(h,-20).ToInt64(), dpi=GetDpiForWindow(h),
                bounds=new {x=bounds.Left,y=bounds.Top,width=bounds.Right-bounds.Left,height=bounds.Bottom-bounds.Top},
                regionKind=kind, region=new {x=regionBounds.Left,y=regionBounds.Top,width=regionBounds.Right-regionBounds.Left,height=regionBounds.Bottom-regionBounds.Top} };
        } finally { DeleteObject(region); }
    }
    [DllImport("kernel32.dll")] static extern bool FreeConsole();
    [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
    public static bool HasConsole() { return GetConsoleWindow() != IntPtr.Zero; }
    public static void DetachConsole() { FreeConsole(); }
    delegate bool EnumProc(IntPtr h, IntPtr p);
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; public Point(int x, int y) { X = x; Y = y; } }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct ProcessEntry {
        public uint Size, Usage, Id; public UIntPtr Heap; public uint Module, Threads, Parent; public int Priority; public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Name;
    }
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr p);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out Rect r);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref Point p);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder title, int count);
    public static bool TextEditing(long value) {
        var title=new StringBuilder(128);GetWindowText(new IntPtr(value),title,title.Capacity);
        return title.ToString()=="Codex Quota Widget [Text editing]";
    }
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint source, uint target, bool attach);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int index, IntPtr value);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attribute, ref int value, int size);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attribute, out int value, int size);
    [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint id);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr h, ref ProcessEntry p);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr h, ref ProcessEntry p);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, System.Text.StringBuilder name, ref int size);
    static string Image(int pid) {
        var process = OpenProcess(0x1000, false, pid);
        if (process == IntPtr.Zero) return "";
        try { int size=2048;var name=new System.Text.StringBuilder(size);return QueryFullProcessImageNameW(process,0,name,ref size)?name.ToString():""; }
        finally { CloseHandle(process); }
    }
    static bool CodexImage(string p) { return p.IndexOf(@"\WindowsApps\OpenAI.Codex_", StringComparison.OrdinalIgnoreCase) >= 0 && (p.EndsWith(@"\app\ChatGPT.exe", StringComparison.OrdinalIgnoreCase) || p.EndsWith(@"\app\Codex.exe", StringComparison.OrdinalIgnoreCase)); }
    static int[] Roots() {
        var parents = new Dictionary<int, int>(); var candidates = new HashSet<int>();
        var snapshot = CreateToolhelp32Snapshot(2, 0);
        if (snapshot == new IntPtr(-1)) return new int[0];
        try {
            var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf(typeof(ProcessEntry)) };
            if (Process32FirstW(snapshot, ref entry)) do {
                if (string.Equals(entry.Name, "ChatGPT.exe", StringComparison.OrdinalIgnoreCase) || string.Equals(entry.Name, "Codex.exe", StringComparison.OrdinalIgnoreCase)) {
                    int pid = (int)entry.Id;
                    if (!CodexImage(Image(pid))) continue;
                    try { using (var process = Process.GetProcessById(pid)) { if (process.SessionId != Process.GetCurrentProcess().SessionId) continue; } } catch { continue; }
                    candidates.Add(pid); parents[pid] = (int)entry.Parent;
                }
            } while (Process32NextW(snapshot, ref entry));
        } finally { CloseHandle(snapshot); }
        return candidates.Where(pid => !candidates.Contains(parents[pid])).ToArray();
    }
    static IntPtr lastWindow = IntPtr.Zero;
    static Dictionary<string, object> Capture(int[] roots) {
        var windows = new List<IntPtr>(); var fg = GetForegroundWindow();
        EnumWindows((h, p) => {
            uint pid; GetWindowThreadProcessId(h, out pid);
            if (!roots.Contains((int)pid)) return true;
            int cloaked = 0; try { DwmGetWindowAttribute(h, 14, out cloaked, 4); } catch { }
            if (roots.Contains((int)pid) && GetWindow(h, 4) == IntPtr.Zero && IsWindowVisible(h) && cloaked == 0 && (GetWindowLongPtr(h, -20).ToInt64() & 0x80) == 0) windows.Add(h);
            return true;
        }, IntPtr.Zero);
        IntPtr chosen = windows.Contains(fg) ? fg : windows.Contains(lastWindow) ? lastWindow : windows.FirstOrDefault();
        if (chosen != IntPtr.Zero) lastWindow = chosen;
        var rect = new Rect(); var point = new Point(0, 0); uint ownerPid = 0;
        if (chosen != IntPtr.Zero) { GetClientRect(chosen, out rect); ClientToScreen(chosen, ref point); GetWindowThreadProcessId(chosen, out ownerPid); }
        bool visible = chosen != IntPtr.Zero && !IsIconic(chosen) && rect.Right > 0 && rect.Bottom > 0;
        return new Dictionary<string, object> {
            { "hostAlive", roots.Length > 0 }, { "hostPid", ownerPid != 0 ? (int)ownerPid : roots.FirstOrDefault() },
            { "window", chosen.ToInt64().ToString() }, { "visible", visible }, { "dpi", chosen == IntPtr.Zero ? 96 : GetDpiForWindow(chosen) },
            { "modal", chosen != IntPtr.Zero && !IsWindowEnabled(chosen) },
            { "bounds", new { x = point.X, y = point.Y, width = Math.Max(1, rect.Right), height = Math.Max(1, rect.Bottom) } }
        };
    }
    static int[] cachedRoots = new int[0];
    static DateTime scannedAt = DateTime.MinValue;
    public static Dictionary<string, object> Probe() {
        IntPtr previous = IntPtr.Zero;
        try { previous = SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
        try {
            if ((DateTime.UtcNow - scannedAt).TotalMilliseconds > (cachedRoots.Length == 0 ? 250 : 750)) { cachedRoots = Roots(); scannedAt = DateTime.UtcNow; }
            var state = Capture(cachedRoots);
            state["mouseButtons"] = ((GetAsyncKeyState(1) & 0x8000) != 0 ? 1 : 0) | ((GetAsyncKeyState(2) & 0x8000) != 0 ? 2 : 0);
            state["mouseSampleAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return state;
        } finally { if (previous != IntPtr.Zero) SetThreadDpiAwarenessContext(previous); }
    }
    // Disable the OS-owned-window fade/slide only. Renderer/CSS press springs
    // remain untouched. Apply once when a verified Electron handle arrives.
    public static bool ConfigureOverlay(long overlayValue) {
        var overlay = new IntPtr(overlayValue); uint pid; GetWindowThreadProcessId(overlay, out pid);
        if (!Image((int)pid).EndsWith(@"\electron\dist\electron.exe", StringComparison.OrdinalIgnoreCase)) return false;
        int disabled = 1;
        return DwmSetWindowAttribute(overlay, 3, ref disabled, sizeof(int)) == 0;
    }
    public static bool Attach(long overlayValue, long ownerValue) {
        var overlay = new IntPtr(overlayValue); var owner = new IntPtr(ownerValue); uint overlayPid, ownerPid;
        GetWindowThreadProcessId(overlay, out overlayPid); GetWindowThreadProcessId(owner, out ownerPid);
        if (!Image((int)overlayPid).EndsWith(@"\electron\dist\electron.exe", StringComparison.OrdinalIgnoreCase) || !CodexImage(Image((int)ownerPid))) return false;
        SetWindowLongPtr(overlay, -8, owner);
        if (GetWindow(overlay, 4) != owner) return false;
        StopFollowing();
        follower = new NativeFollower(overlay, owner);
        follower.Start();
        return follower.Running;
    }
    static NativeFollower follower;
    // A process-wide monotonic epoch survives reattachment. A short minimize /
    // restore, dialog cycle or return to Codex stays observable between polls.
    static long visibilityRevision;
    public static long VisibilityRevision() { return Interlocked.Read(ref visibilityRevision); }
    public static bool IsFollowing() { var f = follower; return f != null && f.Running; }
    public static object FollowMetrics() {
        var f = follower;
        return new { enabled = f != null && f.Running, events = f == null ? 0 : Interlocked.Read(ref f.Events), moves = f == null ? 0 : Interlocked.Read(ref f.Moves), wheels = f == null ? 0 : Interlocked.Read(ref f.Wheels), error = f == null ? "" : f.Error };
    }
    public static object[] DrainWheels() { var f=follower;return f==null?new object[0]:f.DrainWheels(); }
    public static bool DrainOutsideClick() { var f=follower;return f!=null&&f.DrainOutsideClick(); }
    public static bool WidgetVisible(long overlayValue) { return overlayValue != 0 && IsWindowVisible(new IntPtr(overlayValue)) && !IsIconic(new IntPtr(overlayValue)); }
    public static void Detach(long overlayValue) { StopFollowing(); var overlay = new IntPtr(overlayValue); uint pid; GetWindowThreadProcessId(overlay, out pid); if (Image((int)pid).EndsWith(@"\electron\dist\electron.exe", StringComparison.OrdinalIgnoreCase)) SetWindowLongPtr(overlay, -8, IntPtr.Zero); }
    public static void StopFollowing() { var f = follower; follower = null; if (f != null) f.Stop(); }

    // This message pump owns physical position. Neither PowerShell IPC nor the
    // Electron data thread participates in ordinary moves. Reading the latest
    // client rectangle coalesces old WinEvents instead of replaying positions.
    sealed class NativeFollower {
        const uint SyncMessage = 0x8001, RestoreFocusMessage = 0x8002, QuitMessage = 0x0012;
        const uint NoSize = 0x0001, NoZOrder = 0x0004, NoActivate = 0x0010, AsyncPosition = 0x4000;
        [StructLayout(LayoutKind.Sequential)] struct Message {
            public IntPtr Hwnd; public uint Id; public UIntPtr WParam; public IntPtr LParam;
            public uint Time; public Point Position; public uint Private;
        }
        delegate void WinEvent(IntPtr hook, uint ev, IntPtr hwnd, int obj, int child, uint thread, uint time);
        [StructLayout(LayoutKind.Sequential)] struct MouseEvent {
            public Point Position; public uint Data, Flags, Time; public UIntPtr Extra;
        }
        delegate IntPtr MouseHook(int code, UIntPtr message, IntPtr value);
        [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int kind, MouseHook callback, IntPtr module, uint thread);
        [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, UIntPtr message, IntPtr value);
        [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr hwnd, ref Point point);
        [DllImport("kernel32.dll", CharSet = CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
        [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint first, uint last, IntPtr module, WinEvent callback, uint process, uint thread, uint flags);
        [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
        [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread, uint message, UIntPtr w, IntPtr l);
        [DllImport("user32.dll")] static extern int GetMessage(out Message message, IntPtr hwnd, uint first, uint last);
        [DllImport("user32.dll")] static extern bool PeekMessage(out Message message, IntPtr hwnd, uint first, uint last, uint remove);
        [DllImport("user32.dll")] static extern bool TranslateMessage(ref Message message);
        [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Message message);
        [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
        [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
        [DllImport("user32.dll", SetLastError = true)] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
        [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
        readonly IntPtr overlay, host;
        readonly uint hostPid, overlayPid;
        readonly ManualResetEvent initialized = new ManualResetEvent(false);
        readonly Thread thread;
        uint threadId; int posted, restoringFocus, focusPending;
        Timer focusTimer;
        volatile bool stopping;
        public volatile bool Running;
        public string Error = "";
        public long Events, Moves, Wheels;
        int outsideClick;
        public bool DrainOutsideClick() { return Interlocked.Exchange(ref outsideClick,0)!=0; }
        readonly System.Collections.Generic.Queue<object> wheelQueue=new System.Collections.Generic.Queue<object>();
        public object[] DrainWheels() { lock(wheelQueue) { var result=wheelQueue.ToArray();wheelQueue.Clear();return result; } }
        WinEvent callback;
        public NativeFollower(IntPtr overlay, IntPtr host) {
            this.overlay = overlay; this.host = host;
            GetWindowThreadProcessId(host, out hostPid);
            GetWindowThreadProcessId(overlay, out overlayPid);
            thread = new Thread(Pump) { IsBackground = true, Name = "Quota native window follow" };
        }
        public void Start() { thread.Start(); initialized.WaitOne(1000); }
        public void Stop() {
            stopping = true;
            if (threadId != 0) PostThreadMessage(threadId, QuitMessage, UIntPtr.Zero, IntPtr.Zero);
            if (thread.Join(1500)) initialized.Dispose();
        }
        void QueueSync() {
            if (!stopping && Interlocked.Exchange(ref posted, 1) == 0)
                if (!PostThreadMessage(threadId, SyncMessage, UIntPtr.Zero, IntPtr.Zero)) Interlocked.Exchange(ref posted, 0);
        }
        void OnEvent(IntPtr hook, uint ev, IntPtr hwnd, int obj, int child, uint sourceThread, uint time) {
            if ((hwnd == host || hwnd == overlay) && obj == 0 && child == 0) { Interlocked.Increment(ref Events); QueueSync(); }
        }
        void OnLifecycle(IntPtr hook, uint ev, IntPtr hwnd, int obj, int child, uint sourceThread, uint time) {
            if (stopping || hwnd == IntPtr.Zero || hwnd == overlay || obj != 0 || child != 0) return;
            if (ev != 0x0010 && ev != 0x0011 && ev != 0x0016 && ev != 0x0017 && ev != 0x8002 && ev != 0x8003) return;
            uint pid; GetWindowThreadProcessId(hwnd, out pid);
            if (pid != hostPid || (hwnd != host && GetAncestor(hwnd, 3) != host)) return;
            // Chromium child surfaces and tooltips show/hide during ordinary
            // work. Only the host or a top-level dialog lifecycle can invalidate
            // its owned overlay; child visibility is not evidence.
            if (hwnd != host && (GetAncestor(hwnd, 2) != hwnd || (ev != 0x0010 && ev != 0x0011))) return;
            Interlocked.Increment(ref visibilityRevision);
            Interlocked.Increment(ref Events); QueueSync();
        }
        bool CanRestoreFocus() {
            if (stopping || GetForegroundWindow() != overlay || !IsWindow(host) || !IsWindow(overlay) ||
                !IsWindowVisible(host) || !IsWindowEnabled(host) || IsIconic(host) || GetWindow(overlay, 4) != host) return false;
            uint currentHostPid, currentOverlayPid;
            GetWindowThreadProcessId(host, out currentHostPid); GetWindowThreadProcessId(overlay, out currentOverlayPid);
            return currentHostPid == hostPid && currentOverlayPid == overlayPid && !TextEditing(overlay.ToInt64());
        }
        void OnOverlayFocus(IntPtr hook, uint ev, IntPtr hwnd, int obj, int child, uint sourceThread, uint time) {
            // Observe activation out of process; never replace Chromium's WndProc
            // or alter WM_MOUSEACTIVATE. A stale event must not steal another app's focus.
            if (hwnd == IntPtr.Zero || GetAncestor(hwnd, 2) != overlay || !CanRestoreFocus()) return;
            // Immediate deactivation can interrupt Chromium's mouse delivery.
            // One bounded delay lets the down event arrive; bursts do not extend it.
            if (Interlocked.Exchange(ref focusPending, 1) == 0) focusTimer.Change(80, Timeout.Infinite);
        }
        IntPtr OnMouse(int code, UIntPtr message, IntPtr value) {
            // Passive dismissal signal only. Never consume or re-inject an
            // outside click; the original host/application receives it normally.
            if(code>=0 && (message.ToUInt64()==0x0201 || message.ToUInt64()==0x0204) && !stopping &&
               (GetForegroundWindow()==host || GetForegroundWindow()==overlay) &&
               IsWindowVisible(overlay) && !IsIconic(host) && GetWindow(overlay,4)==host) {
                try {
                    var mouse=(MouseEvent)Marshal.PtrToStructure(value,typeof(MouseEvent));
                    var context=SetThreadDpiAwarenessContext(new IntPtr(-4));
                    try {
                        var point=mouse.Position;var shape=CreateRectRgn(0,0,0,0);
                        if(shape!=IntPtr.Zero)try {
                            // Region membership is independent of the 16ms
                            // ignore-mouse toggle; a quick entry click is internal.
                            if(ScreenToClient(overlay,ref point) && GetWindowRgn(overlay,shape)>0 && !PtInRegion(shape,point.X,point.Y))Interlocked.Exchange(ref outsideClick,1);
                        } finally { DeleteObject(shape); }
                    }
                    finally { if(context!=IntPtr.Zero)SetThreadDpiAwarenessContext(context); }
                } catch { /* A failed observation must not affect mouse delivery. */ }
            }
            // Foreground-only Windows wheel routing otherwise sends wheel to
            // Codex after our focus recovery. Forward only over this overlay's
            // native shape; outside it, or while another app is active, pass on.
            if (code >= 0 && message.ToUInt64() == 0x020A && !stopping && GetForegroundWindow() == host &&
                IsWindowVisible(overlay) && IsWindowEnabled(host) && !IsIconic(host) && GetWindow(overlay, 4) == host) {
                try {
                    var mouse = (MouseEvent)Marshal.PtrToStructure(value, typeof(MouseEvent));
                    var context=SetThreadDpiAwarenessContext(new IntPtr(-4));
                    bool inside;var point=mouse.Position;
                    try { inside=GetAncestor(WindowFromPoint(point),2)==overlay && ScreenToClient(overlay,ref point); }
                    finally { if(context!=IntPtr.Zero)SetThreadDpiAwarenessContext(context); }
                    if (inside && point.X>=0 && point.Y>=0 && point.X<=32768 && point.Y<=32768) {
                        // Chromium ignores an inactive HWND's posted WM_MOUSEWHEEL.
                        // Drain bounded events through the existing authenticated
                        // local pipe, then Electron sends native renderer input.
                        lock(wheelQueue) {
                            if(wheelQueue.Count<32) {
                                wheelQueue.Enqueue(new {x=point.X,y=point.Y,delta=(int)unchecked((short)(mouse.Data>>16)),shift=(GetAsyncKeyState(0x10)&0x8000)!=0,control=(GetAsyncKeyState(0x11)&0x8000)!=0});
                                Interlocked.Increment(ref Wheels);
                                return new IntPtr(1);
                            }
                        }
                    }
                } catch { /* Fail open: never swallow an event we cannot forward. */ }
            }
            return CallNextHookEx(IntPtr.Zero, code, message, value);
        }
        void RestoreFocus() {
            if (!CanRestoreFocus() || Interlocked.Exchange(ref restoringFocus, 1) != 0) return;
            bool attachedOverlay = false, attachedHost = false;
            uint ignored;
            uint overlayThread = GetWindowThreadProcessId(overlay, out ignored);
            uint hostThread = GetWindowThreadProcessId(host, out ignored);
            try {
                if (!CanRestoreFocus()) return;
                SetForegroundWindow(host);
                if (GetForegroundWindow() == host || !CanRestoreFocus()) return;
                // Foreground lock rules can reject the direct call. Join only
                // these validated input queues, for the duration of the retry.
                if (overlayThread != threadId) attachedOverlay = AttachThreadInput(threadId, overlayThread, true);
                if (hostThread != threadId && hostThread != overlayThread) attachedHost = AttachThreadInput(threadId, hostThread, true);
                if (CanRestoreFocus()) SetForegroundWindow(host);
            } finally {
                if (attachedHost) AttachThreadInput(threadId, hostThread, false);
                if (attachedOverlay) AttachThreadInput(threadId, overlayThread, false);
                Interlocked.Exchange(ref restoringFocus, 0);
            }
        }
        void SyncBounds() {
            if (stopping || !IsWindow(host) || !IsWindow(overlay) || IsIconic(host)) return;
            Rect client, current; var origin = new Point(0, 0);
            if (!GetClientRect(host, out client) || !ClientToScreen(host, ref origin) || !GetWindowRect(overlay, out current)) return;
            int width = client.Right - client.Left, height = client.Bottom - client.Top;
            if (width <= 10 || height <= 10) return;
            // Electron's fixed-size widget enforces its own WM_GETMINMAXINFO.
            // Its API must resize the viewport; native messages only move it.
            // This also avoids DPI rounding feeding back into repeated resizes.
            if (current.Left == origin.X && current.Top == origin.Y) return;
            uint flags = NoZOrder | NoActivate | AsyncPosition | NoSize;
            if (SetWindowPos(overlay, IntPtr.Zero, origin.X, origin.Y, 0, 0, flags)) Interlocked.Increment(ref Moves);
            else Error = "Window move failed: " + Marshal.GetLastWin32Error();
        }
        void Pump() {
            IntPtr locationHook = IntPtr.Zero, moveHook = IntPtr.Zero, lifecycleHook = IntPtr.Zero, showHook = IntPtr.Zero, foregroundHook = IntPtr.Zero, focusHook = IntPtr.Zero, nameHook = IntPtr.Zero, wheelHook = IntPtr.Zero, previous = IntPtr.Zero;
            WinEvent lifecycleCallback = OnLifecycle;
            WinEvent focusCallback = OnOverlayFocus;
            MouseHook wheelCallback = OnMouse;
            try {
                previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
                threadId = GetCurrentThreadId(); Message message;
                PeekMessage(out message, IntPtr.Zero, 0, 0, 0); // Create the thread queue before announcing readiness.
                focusTimer = new Timer(_ => {
                    if (!stopping && !PostThreadMessage(threadId, RestoreFocusMessage, UIntPtr.Zero, IntPtr.Zero)) Interlocked.Exchange(ref focusPending, 0);
                }, null, Timeout.Infinite, Timeout.Infinite);
                callback = OnEvent;
                locationHook = SetWinEventHook(0x800B, 0x800B, IntPtr.Zero, callback, 0, 0, 2);
                moveHook = SetWinEventHook(0x000A, 0x000B, IntPtr.Zero, callback, 0, 0, 2);
                lifecycleHook = SetWinEventHook(0x0010, 0x0017, IntPtr.Zero, lifecycleCallback, hostPid, 0, 2);
                showHook = SetWinEventHook(0x8002, 0x8003, IntPtr.Zero, lifecycleCallback, hostPid, 0, 2);
                // Activation recovery does not hide/show or remap the overlay.
                foregroundHook = SetWinEventHook(0x0003, 0x0003, IntPtr.Zero, focusCallback, overlayPid, 0, 2);
                focusHook = SetWinEventHook(0x8005, 0x8005, IntPtr.Zero, focusCallback, overlayPid, 0, 2);
                // Ending deliberate inline text entry changes this exact window's
                // title. Reuse the 80ms recovery even if foreground did not change.
                nameHook = SetWinEventHook(0x800C, 0x800C, IntPtr.Zero, focusCallback, overlayPid, 0, 2);
                // Low-level hooks run on this existing message-pump thread,
                // out of process; no DLL injection or WndProc replacement.
                wheelHook = SetWindowsHookEx(14, wheelCallback, GetModuleHandle(null), 0);
                Running = locationHook != IntPtr.Zero && moveHook != IntPtr.Zero && lifecycleHook != IntPtr.Zero && showHook != IntPtr.Zero && foregroundHook != IntPtr.Zero && focusHook != IntPtr.Zero && nameHook != IntPtr.Zero && wheelHook != IntPtr.Zero;
                if (!Running) { Error = "Window event hooks unavailable"; return; }
                initialized.Set(); QueueSync();
                while (!stopping && GetMessage(out message, IntPtr.Zero, 0, 0) > 0) {
                    if (message.Id == SyncMessage) { Interlocked.Exchange(ref posted, 0); SyncBounds(); }
                    else if (message.Id == RestoreFocusMessage) { Interlocked.Exchange(ref focusPending, 0); RestoreFocus(); }
                    else { TranslateMessage(ref message); DispatchMessage(ref message); }
                }
            } catch (Exception ex) { Error = ex.GetType().Name; }
            finally {
                Running = false; initialized.Set();
                if (locationHook != IntPtr.Zero) UnhookWinEvent(locationHook);
                if (moveHook != IntPtr.Zero) UnhookWinEvent(moveHook);
                if (lifecycleHook != IntPtr.Zero) UnhookWinEvent(lifecycleHook);
                if (showHook != IntPtr.Zero) UnhookWinEvent(showHook);
                if (foregroundHook != IntPtr.Zero) UnhookWinEvent(foregroundHook);
                if (focusHook != IntPtr.Zero) UnhookWinEvent(focusHook);
                if (nameHook != IntPtr.Zero) UnhookWinEvent(nameHook);
                if (wheelHook != IntPtr.Zero) UnhookWindowsHookEx(wheelHook);
                lock(wheelQueue)wheelQueue.Clear();
                if (focusTimer != null) focusTimer.Dispose();
                if (previous != IntPtr.Zero) SetThreadDpiAwarenessContext(previous);
                GC.KeepAlive(callback);
                GC.KeepAlive(lifecycleCallback);
                GC.KeepAlive(focusCallback);
                GC.KeepAlive(wheelCallback);
            }
        }
    }
    public static object Hit(int x, int y) {
        IntPtr previous = IntPtr.Zero;
        try { previous = SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
        try {
            var h = WindowFromPoint(new Point(x, y)); uint pid; GetWindowThreadProcessId(h, out pid);
            return new { window = h.ToInt64().ToString(), rootWindow = GetAncestor(h, 2).ToInt64().ToString(), pid = pid };
        } finally { if (previous != IntPtr.Zero) SetThreadDpiAwarenessContext(previous); }
    }
}
