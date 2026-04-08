import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";
import {
  BarChart2,
  Clock,
  Dumbbell,
  LogOut,
  NotebookPen,
  PanelLeft,
  Tag,
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

const hronosMenuItems = [
  { icon: Clock, label: "РЈС‡С‘С‚ РІСЂРµРјРµРЅРё", path: "/" },
  { icon: BarChart2, label: "РђРЅР°Р»РёС‚РёРєР°", path: "/analytics" },
  { icon: Tag, label: "РљР°С‚РµРіРѕСЂРёРё С‚РµРіРѕРІ", path: "/tags" },
];

const topLevelItems = [
  { icon: Clock, label: "Хронос", path: "/" },
  { icon: NotebookPen, label: "Тардис", path: "/tardis" },
  { icon: Dumbbell, label: "Тренировки", path: "/training" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

function isRouteActive(location: string, path: string) {
  if (path === "/") {
    return (
      location === "/" ||
      location.startsWith("/tracking") ||
      location.startsWith("/analytics") ||
      location.startsWith("/tags")
    );
  }

  return location === path || location.startsWith(`${path}/`);
}

function getActiveTopLevelItem(location: string) {
  return topLevelItems.find(item => isRouteActive(location, item.path)) ?? topLevelItems[0];
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex w-full max-w-md flex-col items-center gap-8 p-8">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-center text-2xl font-semibold tracking-tight">
              Р’РѕР№РґРёС‚Рµ, С‡С‚РѕР±С‹ РїСЂРѕРґРѕР»Р¶РёС‚СЊ
            </h1>
            <p className="max-w-sm text-center text-sm text-muted-foreground">
              Р”Р»СЏ РґРѕСЃС‚СѓРїР° Рє РїР°РЅРµР»Рё РЅСѓР¶РЅР° Р°РІС‚РѕСЂРёР·Р°С†РёСЏ. РџСЂРѕРґРѕР»Р¶РёС‚Рµ РІС…РѕРґ С‡РµСЂРµР·
              Google.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg transition-all hover:shadow-xl"
          >
            Р’РѕР№С‚Рё
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const activeTopLevelItem = useMemo(() => getActiveTopLevelItem(location), [location]);
  const activeHronosItem = useMemo(
    () => hronosMenuItems.find(item => isRouteActive(location, item.path)) ?? hronosMenuItems[0],
    [location]
  );

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = event.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          <SidebarHeader className="h-16 justify-center border-b border-border/70">
            <div className="flex w-full items-center gap-3 px-2 transition-all">
              <button
                onClick={toggleSidebar}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="min-w-0">
                  <span className="truncate font-semibold tracking-tight">{activeTopLevelItem.label}</span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-3">
              {hronosMenuItems.map(item => {
                const isActive = isRouteActive(location, item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-10 font-normal transition-all"
                    >
                      <item.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-border/70 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center">
                  <Avatar className="h-9 w-9 shrink-0 border">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-medium leading-none">{user?.name || "-"}</p>
                    <p className="mt-1.5 truncate text-xs text-muted-foreground">{user?.email || "-"}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Р’С‹Р№С‚Рё</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={cn(
            "absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/20",
            isCollapsed && "hidden"
          )}
          onMouseDown={() => {
            if (!isCollapsed) setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        <div className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-3 md:h-16 md:px-4">
            {isMobile ? <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" /> : null}
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              {topLevelItems.map(item => {
                const isActive = isRouteActive(location, item.path);
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => setLocation(item.path)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-2 border px-3 py-1.5 text-sm font-medium transition-colors",
                      isActive
                        ? "border-white bg-background text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
                        : "border-border/80 bg-muted/20 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            {isMobile ? (
              <div className="text-xs text-muted-foreground">{activeTopLevelItem.label}</div>
            ) : null}
          </div>
        </div>

        <main className="flex-1 overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
