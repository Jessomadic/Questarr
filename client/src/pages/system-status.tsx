import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Download,
  ExternalLink,
  RefreshCw,
  Rocket,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ApiError, apiRequest } from "@/lib/queryClient";

type UpdateChannel = "stable" | "prerelease";

interface UpdateAsset {
  name: string;
  size: number;
  browserDownloadUrl: string;
}

interface UpdateRelease {
  tagName: string;
  version: string;
  name: string;
  prerelease: boolean;
  draft: boolean;
  publishedAt: string | null;
  htmlUrl: string;
  body: string;
  asset: UpdateAsset | null;
}

interface UpdateCheckResult {
  currentVersion: string;
  currentTag: string;
  repo: string;
  channel: UpdateChannel;
  supported: boolean;
  updateAvailable: boolean;
  release: UpdateRelease | null;
  downloadedInstallerPath: string | null;
  reason?: string;
}

interface UpdateDownloadResult {
  downloaded: true;
  installerPath: string;
  fileName: string;
  sizeBytes: number;
  release: UpdateRelease;
}

interface UpdateInstallResult {
  started: true;
  installerPath: string;
  command: string;
  args: string[];
  message: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "Unknown";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export default function SystemStatusPage() {
  const [channel, setChannel] = useState<UpdateChannel>("stable");
  const [downloadedInstallerPath, setDownloadedInstallerPath] = useState<string | null>(null);
  const { toast } = useToast();

  const queryUrl = useMemo(
    () => `/api/system/updates?channel=${encodeURIComponent(channel)}`,
    [channel]
  );

  const { data, error, isLoading, isFetching, refetch } = useQuery<UpdateCheckResult>({
    queryKey: ["/api/system/updates", channel],
    queryFn: async () => {
      const response = await apiRequest("GET", queryUrl);
      return response.json();
    },
  });

  const downloadMutation = useMutation<UpdateDownloadResult>({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/system/updates/download", { channel });
      return response.json();
    },
    onSuccess: (result) => {
      setDownloadedInstallerPath(result.installerPath);
      toast({
        title: "Update downloaded",
        description: `${result.fileName} is ready for silent install.`,
      });
      void refetch();
    },
    onError: (mutationError) => {
      toast({
        title: "Download failed",
        description: getErrorMessage(mutationError, "Questarr could not download the update."),
        variant: "destructive",
      });
    },
  });

  const installMutation = useMutation<UpdateInstallResult>({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/system/updates/install", { channel });
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Silent update started",
        description: result.message,
      });
    },
    onError: (mutationError) => {
      toast({
        title: "Silent update failed",
        description: getErrorMessage(mutationError, "Questarr could not start the updater."),
        variant: "destructive",
      });
    },
  });

  const release = data?.release ?? null;
  const asset = release?.asset ?? null;
  const currentDownloadPath = downloadedInstallerPath || data?.downloadedInstallerPath || null;
  const canDownload = !!asset && !downloadMutation.isPending;
  const canInstall = !!asset && data?.supported !== false && !installMutation.isPending;

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-normal">System Status</h2>
            {data?.supported === false ? (
              <Badge variant="outline">Unsupported</Badge>
            ) : (
              <Badge variant="secondary">Windows updater</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Check Questarr releases, download the Windows installer, and run silent upgrades.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={channel} onValueChange={(value) => setChannel(value as UpdateChannel)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stable">Live releases</SelectItem>
              <SelectItem value="prerelease">Pre-releases</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "animate-spin" : ""} />
            Check now
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Update check failed</AlertTitle>
          <AlertDescription>
            {getErrorMessage(error, "Questarr could not contact GitHub releases.")}
          </AlertDescription>
        </Alert>
      ) : null}

      {data?.reason ? (
        <Alert>
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Silent updater unavailable</AlertTitle>
          <AlertDescription>{data.reason}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="rounded-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Release Channel</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-9">Field</TableHead>
                  <TableHead className="h-9">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="py-3 font-medium">Current version</TableCell>
                  <TableCell className="py-3">{data?.currentVersion ?? "Unknown"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-3 font-medium">Repository</TableCell>
                  <TableCell className="py-3">{data?.repo ?? "Jessomadic/Questarr"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-3 font-medium">Latest release</TableCell>
                  <TableCell className="py-3">
                    {isLoading ? "Checking..." : release ? release.tagName : "No release found"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-3 font-medium">Release type</TableCell>
                  <TableCell className="py-3">
                    {release ? (
                      <Badge variant={release.prerelease ? "outline" : "secondary"}>
                        {release.prerelease ? "pre-release" : "live release"}
                      </Badge>
                    ) : (
                      "Unknown"
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-3 font-medium">Update state</TableCell>
                  <TableCell className="py-3">
                    <Badge variant={data?.updateAvailable ? "default" : "outline"}>
                      {data?.updateAvailable ? "available" : "current"}
                    </Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-3 font-medium">Published</TableCell>
                  <TableCell className="py-3">{formatDate(release?.publishedAt ?? null)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-3 font-medium">Installer asset</TableCell>
                  <TableCell className="py-3">
                    {asset ? `${asset.name} (${formatBytes(asset.size)})` : "Missing"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-3 font-medium">Downloaded installer</TableCell>
                  <TableCell className="py-3 break-all">
                    {currentDownloadPath ?? "Not downloaded"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Updater Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full justify-start"
              variant="outline"
              disabled={!canDownload}
              onClick={() => downloadMutation.mutate()}
            >
              <Download />
              {downloadMutation.isPending ? "Downloading..." : "Download installer"}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full justify-start" disabled={!canInstall}>
                  <Rocket />
                  {installMutation.isPending ? "Starting..." : "Download and silently install"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Run silent Questarr update?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Questarr will download the selected installer if needed, start it with silent
                    setup flags, stop the running service, replace the application files, and start
                    the service again. Runtime data in ProgramData is preserved.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => installMutation.mutate()}>
                    Start silent update
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {release?.htmlUrl ? (
              <Button asChild className="w-full justify-start" variant="ghost">
                <a href={release.htmlUrl} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  View release
                </a>
              </Button>
            ) : null}

            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Silent install uses the same Windows setup package as manual releases, including the
              service shutdown, firewall rule refresh, and data-preserving upgrade path.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
