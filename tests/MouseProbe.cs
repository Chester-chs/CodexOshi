using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

// Interactive regression probe requested by the user. Targets are validated by
// Invoke-MouseProbe.ps1; never used by the installed widget/runtime.
public static class QuotaMouseProbe {
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; public Point(int x,int y){X=x;Y=y;} }
    [StructLayout(LayoutKind.Sequential)] struct Mouse { public int X,Y;public uint Data,Flags,Time;public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] struct Input { public uint Type;public Mouse Mouse; }
    [StructLayout(LayoutKind.Sequential)] struct Message { public IntPtr Hwnd;public uint Id;public UIntPtr WParam;public IntPtr LParam;public uint Time;public Point Position;public uint Private; }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint source,uint target,bool attach);
    [DllImport("user32.dll")] static extern bool PeekMessage(out Message message,IntPtr hwnd,uint first,uint last,uint remove);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd,uint flag);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,Input[] input,int size);
    [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint msg,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
    public static long Foreground() { return GetForegroundWindow().ToInt64(); }
    public static bool ActivateHost(long hwnd) {
        if (Foreground()==hwnd) return true;
        SetForegroundWindow(new IntPtr(hwnd)); Thread.Sleep(200);
        if (Foreground()==hwnd) return true;
        // Controlled preparation only. All queues are detached before sending
        // input or observing recovery, so this cannot make recovery tests pass.
        uint ignored, own=GetCurrentThreadId();
        uint foreground=GetWindowThreadProcessId(GetForegroundWindow(),out ignored);
        uint host=GetWindowThreadProcessId(new IntPtr(hwnd),out ignored);
        Message message;PeekMessage(out message,IntPtr.Zero,0,0,0);
        bool attachedForeground=false,attachedHost=false;
        try {
            if(foreground!=0 && foreground!=own) attachedForeground=AttachThreadInput(own,foreground,true);
            if(host!=0 && host!=own && host!=foreground) attachedHost=AttachThreadInput(own,host,true);
            SetForegroundWindow(new IntPtr(hwnd));
        } finally {
            if(attachedHost) AttachThreadInput(own,host,false);
            if(attachedForeground) AttachThreadInput(own,foreground,false);
        }
        Thread.Sleep(200);
        return Foreground()==hwnd;
    }
    public static void Move(int x,int y) {
        var old=SetThreadDpiAwarenessContext(new IntPtr(-4));
        try { if(!SetCursorPos(x,y)) throw new Win32Exception(); }
        finally { if(old!=IntPtr.Zero) SetThreadDpiAwarenessContext(old); }
    }
    public static long Hit(int x,int y) {
        var old=SetThreadDpiAwarenessContext(new IntPtr(-4));
        try { return GetAncestor(WindowFromPoint(new Point(x,y)),2).ToInt64(); }
        finally { if(old!=IntPtr.Zero) SetThreadDpiAwarenessContext(old); }
    }
    static uint Buttons(params uint[] flags) {
        var inputs=new Input[flags.Length];
        for(int i=0;i<flags.Length;i++)inputs[i]=new Input {Type=0,Mouse=new Mouse {Flags=flags[i]}};
        uint sent=SendInput((uint)inputs.Length,inputs,Marshal.SizeOf(typeof(Input)));
        if(sent!=inputs.Length) throw new Win32Exception(Marshal.GetLastWin32Error(),"SendInput failed");
        return sent;
    }
    public static uint Click(){ return Buttons(0x0002,0x0004); }
    static object Observe(uint sent, Stopwatch clock) {
        long immediate=Foreground(); var samples=new List<object>();
        var transitions=new List<object>(); long last=immediate;
        transitions.Add(new {elapsedMs=clock.ElapsedMilliseconds,hwnd=last});
        foreach(int target in new[]{100,300,1000}) {
            while(clock.ElapsedMilliseconds<target) {
                long current=Foreground();
                if(current!=last){transitions.Add(new {elapsedMs=clock.ElapsedMilliseconds,hwnd=current});last=current;}
                Thread.Sleep(1);
            }
            samples.Add(new {targetMs=target,elapsedMs=clock.ElapsedMilliseconds,hwnd=Foreground()});
        }
        return new {sendInputReturned=sent,immediate=immediate,samples=samples,transitions=transitions};
    }
    public static object ClickAndSample() {
        var clock=Stopwatch.StartNew(); uint sent=Click();
        return Observe(sent,clock);
    }
    public static object ClickThenSwitchAndSample(long testWindow) {
        var clock=Stopwatch.StartNew(); uint sent=Click(); Thread.Sleep(20);
        SetForegroundWindow(new IntPtr(testWindow));
        if(Foreground()!=testWindow) throw new InvalidOperationException("Cannot foreground the test-owned window");
        return Observe(sent,clock);
    }
    public static object DragAndSample(int x,int y,int dx,int dy) {
        Drag(x,y,dx,dy);
        return Observe(2,Stopwatch.StartNew());
    }
    public static void Drag(int x,int y,int dx,int dy) {
        Buttons(0x0002);
        try { for(int i=1;i<=10;i++){Thread.Sleep(40);Move(x+dx*i/10,y+dy*i/10);} Thread.Sleep(40); }
        finally { Buttons(0x0004); }
    }
    public static long MouseActivateResult(long overlay,long host) {
        IntPtr result;
        if(SendMessageTimeout(new IntPtr(overlay),0x21,new IntPtr(host),new IntPtr((0x201<<16)|1),2,1000,out result)==IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(),"WM_MOUSEACTIVATE query timed out");
        return result.ToInt64();
    }
}
