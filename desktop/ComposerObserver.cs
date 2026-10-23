using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;

// Read only control classes and rectangles, never names, text or value patterns.
// UIA runs on one background thread: a slow provider cannot stall the native
// follower, overlay heartbeat or startup. Poll only takes a short memory lock.
public static class CodiComposerObserver {
    sealed class Request {
        public long Window;
        public int X, Y, Width, Height;
    }
    static readonly object Gate = new object();
    static Request wanted;
    static Thread worker;
    static long measuredWindow;
    static Dictionary<string, object> measured;
    static DateTime measuredAt;
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    public static object Poll(long window, int x, int y, int width, int height) {
        lock (Gate) {
            wanted = new Request { Window=window, X=x, Y=y, Width=width, Height=height };
            if (worker == null) {
                worker = new Thread(Run) { IsBackground=true, Name="CodexOshi composer bounds" };
                worker.SetApartmentState(ApartmentState.MTA); worker.Start();
            }
            return measuredWindow == window && (DateTime.UtcNow-measuredAt).TotalSeconds < 2 ? measured : null;
        }
    }
    static bool SameViewport(Request request) {
        Rect rect; var point=new Point(); var window=new IntPtr(request.Window);
        return GetClientRect(window,out rect) && ClientToScreen(window,ref point) &&
            point.X==request.X && point.Y==request.Y && rect.Right==request.Width && rect.Bottom==request.Height;
    }
    static void Run() {
        SetThreadDpiAwarenessContext(new IntPtr(-4));
        for (;;) {
            Request request; lock (Gate) { request=wanted; }
            try {
                if (request.Window != 0 && request.Width>1 && request.Height>1 && SameViewport(request)) {
                    var result=Read(request);
                    if (SameViewport(request)) lock (Gate) {
                        measuredWindow=request.Window; measured=result; measuredAt=DateTime.UtcNow;
                    }
                }
            } catch { /* Retain a recent sample across transient UIA rebuilds. */ }
            Thread.Sleep(250);
        }
    }
    static Dictionary<string, object> Read(Request request) {
        var root=AutomationElement.FromHandle(new IntPtr(request.Window));
        var edits=root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit));
        Dictionary<string, object> result=null;
        foreach (AutomationElement edit in edits) {
            if (edit.Current.IsOffscreen || edit.Current.ClassName.IndexOf("ProseMirror",StringComparison.Ordinal)<0) continue;
            AutomationElement candidate=null,element=edit;
            for (int level=0;level<9 && element!=null && !element.Equals(root);level++) {
                var name=element.Current.ClassName;
                if (name.IndexOf("_ComposerLayoutBody_",StringComparison.Ordinal)>=0) candidate=element;
                if (name.IndexOf("--thread-body-max-width",StringComparison.Ordinal)>=0) { candidate=element; break; }
                element=TreeWalker.RawViewWalker.GetParent(element);
            }
            if (candidate==null || candidate.Current.IsOffscreen) continue;
            var bounds=candidate.Current.BoundingRectangle;
            double x=Math.Max(0,bounds.X-request.X),y=Math.Max(0,bounds.Y-request.Y);
            double right=Math.Min(request.Width,bounds.Right-request.X),bottom=Math.Min(request.Height,bounds.Bottom-request.Y);
            if (bounds.IsEmpty || x>=right || y>=bottom) continue;
            if (result!=null && (double)result["y"]<=y) continue;
            result=new Dictionary<string, object> { {"x",x},{"y",y},{"width",right-x},{"height",bottom-y},
                {"viewportWidth",request.Width},{"viewportHeight",request.Height} };
        }
        return result;
    }
}
