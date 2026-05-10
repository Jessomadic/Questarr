import { useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  HardDrive,
  Puzzle,
  Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PlaceholderRow {
  name: string;
  status: "planned" | "ready";
  detail: string;
}

interface PlaceholderConfig {
  title: string;
  description: string;
  icon: typeof Activity;
  rows: PlaceholderRow[];
}

const placeholderConfigs: Record<string, PlaceholderConfig> = {
  "/activity/history": {
    title: "Activity History",
    description: "Completed, failed, grabbed, imported, and ignored events will land here.",
    icon: Clock3,
    rows: [
      {
        name: "Download lifecycle events",
        status: "planned",
        detail: "Grabbed, completed, failed",
      },
      { name: "Manual import events", status: "planned", detail: "Imported, skipped, ignored" },
      { name: "History filters", status: "planned", detail: "Game, event type, source, age" },
    ],
  },
  "/activity/blocklist": {
    title: "Blocklist",
    description: "The release blacklist will move into this Arr-style Activity section.",
    icon: AlertTriangle,
    rows: [
      {
        name: "Existing release blacklist",
        status: "ready",
        detail: "Already blocks search results",
      },
      {
        name: "Activity blocklist table",
        status: "planned",
        detail: "Release, game, indexer, age",
      },
      { name: "Unblock actions", status: "planned", detail: "Restore release eligibility" },
    ],
  },
  "/settings/profiles": {
    title: "Release Profiles",
    description: "Game release profiles and custom-format scoring will be configured here.",
    icon: Settings2,
    rows: [
      {
        name: "Default release profile",
        status: "planned",
        detail: "Platform, protocol, seeders, size",
      },
      {
        name: "Required and ignored terms",
        status: "planned",
        detail: "Filter releases before scoring",
      },
      { name: "Custom formats", status: "planned", detail: "Repack, DLC, update, crackfix, group" },
    ],
  },
  "/settings/media-management": {
    title: "Media Management",
    description: "Root folders, naming, and manual import settings will live here.",
    icon: HardDrive,
    rows: [
      { name: "Root folders", status: "planned", detail: "Path, free space, accessibility" },
      { name: "Naming rules", status: "planned", detail: "Folder format and release suffixes" },
      {
        name: "Manual import defaults",
        status: "planned",
        detail: "Move, copy, hardlink behavior",
      },
    ],
  },
  "/settings/connect": {
    title: "Connect",
    description: "Notification providers will use this provider-style settings area.",
    icon: Puzzle,
    rows: [
      { name: "Discord webhook", status: "ready", detail: "Existing settings will be moved here" },
      {
        name: "Provider test actions",
        status: "planned",
        detail: "Consistent success/failure output",
      },
      { name: "Future providers", status: "planned", detail: "Webhook, Gotify, Telegram, email" },
    ],
  },
  "/system/status": {
    title: "System Status",
    description: "Runtime, version, database, platform, and update state will be shown here.",
    icon: Activity,
    rows: [
      { name: "Application status", status: "planned", detail: "Version, uptime, data directory" },
      { name: "Runtime status", status: "planned", detail: "Node, OS, Windows service state" },
      { name: "Update status", status: "planned", detail: "Current and latest version" },
    ],
  },
  "/system/tasks": {
    title: "Tasks",
    description: "Scheduled and manual maintenance jobs will be exposed here.",
    icon: Clock3,
    rows: [
      { name: "Refresh jobs", status: "planned", detail: "RSS, metadata, xREL, Steam wishlist" },
      { name: "Wanted search", status: "planned", detail: "Run automatic search manually" },
      { name: "Backup job", status: "planned", detail: "Create database and config backups" },
    ],
  },
  "/system/logs": {
    title: "Logs",
    description: "Filtered logs and downloadable diagnostics will be added here.",
    icon: Activity,
    rows: [
      { name: "Recent logs", status: "planned", detail: "Level and module filters" },
      { name: "Secret redaction", status: "planned", detail: "Hide tokens, keys, and passwords" },
      { name: "Download logs", status: "planned", detail: "Export sanitized diagnostics" },
    ],
  },
};

const defaultConfig = placeholderConfigs["/system/status"];

export default function ArrPlaceholderPage() {
  const [location] = useLocation();
  const config = placeholderConfigs[location] ?? defaultConfig;
  const Icon = config.icon;

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-normal">{config.title}</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
        </div>
        <Badge variant="outline" className="shrink-0">
          Arr parity scaffold
        </Badge>
      </div>

      <Card className="rounded-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-9">Capability</TableHead>
                <TableHead className="h-9 w-28">Status</TableHead>
                <TableHead className="h-9">Next implementation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.rows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="py-3 font-medium">{row.name}</TableCell>
                  <TableCell className="py-3">
                    <Badge variant={row.status === "ready" ? "secondary" : "outline"}>
                      {row.status === "ready" ? (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      ) : (
                        <Clock3 className="mr-1 h-3 w-3" />
                      )}
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 text-muted-foreground">{row.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
