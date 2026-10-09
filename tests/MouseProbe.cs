using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Threading;

// Interactive regression probe requested by the user. Targets are validated by
// Invoke-MouseProbe.ps1; never used by the installed widget/runtime.
public static class QuotaMouseProbe {
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; public Point(int x,int y){X=x;Y=y;} }
    [StructLayout(LayoutKind.Sequential)] struct Mouse { public int X,Y;public uint Data,Flags,Time;public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] struct Input { public uint Type;public Mouse Mouse; }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
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
    public static void Drag(int x,int y,int dx,int dy) {
        Buttons(0x0002);
        try { for(int i=1;i<=10;i++){Thread.Sleep(40);Move(x+dx*i/10,y+dy*i/10);} }
        finally { Buttons(0x0004); }
    }
    public static long MouseActivateResult(long overlay,long host) {
        IntPtr result;
        if(SendMessageTimeout(new IntPtr(overlay),0x21,new IntPtr(host),new IntPtr((0x201<<16)|1),2,1000,out result)==IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(),"WM_MOUSEACTIVATE query timed out");
        return result.ToInt64();
    }
}
