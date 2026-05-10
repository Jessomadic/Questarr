import {
  Home,
  Library,
  Download,
  Calendar,
  Settings,
  ListChecks,
  Database,
  HardDrive,
  Compass,
  LogOut,
  User,
  Newspaper,
  Rss,
  PieChart,
  Activity,
  ClipboardList,
  ServerCog,
  Bell,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { type Game, type DownloadStatus } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { GitHubVersionLink } from "@/components/GitHubVersionLink";

interface NavigationItem {
  title: string;
  url: string;
  icon: typeof Home;
  badge?: string;
  legacyUrls?: string[];
}

interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

const navigationGroups: NavigationGroup[] = [
  {
    label: "Library",
    items: [
      {
        title: "Dashboard",
        url: "/",
        icon: Home,
      },
      {
        title: "Library",
        url: "/library",
        icon: Library,
      },
      {
        title: "Wanted",
        url: "/wanted",
        icon: ListChecks,
        legacyUrls: ["/wishlist"],
      },
      {
        title: "Discover",
        url: "/discover",
        icon: Compass,
      },
      {
        title: "Calendar",
        url: "/calendar",
        icon: Calendar,
      },
    ],
  },
  {
    label: "Activity",
    items: [
      {
        title: "Queue",
        url: "/activity/queue",
        icon: Download,
        legacyUrls: ["/downloads", "/activity"],
      },
      {
        title: "History",
        url: "/activity/history",
        icon: Activity,
      },
      {
        title: "Blocklist",
        url: "/activity/blocklist",
        icon: ClipboardList,
      },
    ],
  },
  {
    label: "Feeds",
    items: [
      {
        title: "xREL.to Releases",
        url: "/xrel",
        icon: Newspaper,
      },
      {
        title: "RSS Feeds",
        url: "/rss",
        icon: Rss,
      },
      {
        title: "Stats",
        url: "/stats",
        icon: PieChart,
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "General",
        url: "/settings",
        icon: Settings,
      },
      {
        title: "Profiles",
        url: "/settings/profiles",
        icon: SlidersHorizontal,
      },
      {
        title: "Media Management",
        url: "/settings/media-management",
        icon: Library,
      },
      {
        title: "Indexers",
        url: "/settings/indexers",
        icon: Database,
        legacyUrls: ["/indexers"],
      },
      {
        title: "Download Clients",
        url: "/settings/download-clients",
        icon: HardDrive,
        legacyUrls: ["/downloaders"],
      },
      {
        title: "Connect",
        url: "/settings/connect",
        icon: Bell,
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        title: "Status",
        url: "/system/status",
        icon: ServerCog,
      },
      {
        title: "Tasks",
        url: "/system/tasks",
        icon: ListChecks,
      },
      {
        title: "Logs",
        url: "/system/logs",
        icon: Activity,
      },
    ],
  },
];

interface AppSidebarProps {
  activeItem?: string;
  onNavigate?: (url: string) => void;
}

export default function AppSidebar({ activeItem = "/", onNavigate }: Readonly<AppSidebarProps>) {
  const { logout, user } = useAuth();

  const handleNavigation = (url: string) => {
    onNavigate?.(url);
  };

  const { data: games = [] } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const { data: downloadsData } = useQuery<{ downloads: DownloadStatus[] }>({
    queryKey: ["/api/downloads"],
    refetchInterval: 5000,
  });

  const { libraryCount, wantedCount } = useMemo(() => {
    return games.reduce(
      (counts, g) => {
        if (["owned", "completed", "downloading"].includes(g.status)) {
          counts.libraryCount++;
        } else if (g.status === "wanted") {
          counts.wantedCount++;
        }
        return counts;
      },
      { libraryCount: 0, wantedCount: 0 }
    );
  }, [games]);
  const activeDownloadsCount =
    downloadsData?.downloads?.filter((d) => d.status === "downloading").length || 0;
  const failedDownloadsCount =
    downloadsData?.downloads?.filter((d) => d.status === "error").length || 0;

  const groups = navigationGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      let badge: string | undefined;

      if (item.title === "Library" && libraryCount > 0) {
        badge = libraryCount.toString();
      } else if (item.title === "Wanted" && wantedCount > 0) {
        badge = wantedCount.toString();
      } else if (item.title === "Queue" && activeDownloadsCount > 0) {
        badge = activeDownloadsCount.toString();
      } else if (item.title === "History" && failedDownloadsCount > 0) {
        badge = failedDownloadsCount.toString();
      }

      return { ...item, badge };
    }),
  }));

  const isActive = (item: NavigationItem) => {
    if (activeItem === item.url || item.legacyUrls?.includes(activeItem)) return true;
    const pathDepth = item.url.split("/").filter(Boolean).length;
    return pathDepth > 1 && activeItem.startsWith(`${item.url}/`);
  };

  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center">
            <img src="/Questarr.svg" alt="Questarr Logo" className="w-8 h-8" />
          </div>
          <div>
            <span className="truncate font-semibold">Questarr</span>
            <p className="text-xs text-muted-foreground">Game Management</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={`${group.label}-${item.title}`}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item)}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <button
                        onClick={() => handleNavigation(item.url)}
                        className="flex items-center justify-between w-full"
                        aria-label={
                          item.badge
                            ? `${item.title}, ${item.badge} ${
                                item.title === "Queue" ? "active downloads" : "items"
                              }`
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <item.icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </div>
                        {item.badge && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {item.badge}
                          </Badge>
                        )}
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <div className="flex-1" />
        {/* Divider above GitHub link */}
        <div className="border-t border-[#374151]/40 mx-2 mb-2" />
        {/* GitHub link and version info at the bottom */}
        <div className="flex items-center justify-center pb-2">
          <GitHubVersionLink />
        </div>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => logout()}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-pointer w-full"
              tooltip="Log out"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <User className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user?.username || "User"}</span>
                <span className="truncate text-xs">Logged in</span>
              </div>
              <LogOut className="ml-auto size-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
