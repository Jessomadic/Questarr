import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CANONICAL_PLATFORMS } from "@shared/title-utils";
import type {
  CustomFormat,
  CustomFormatConditionType,
  CustomFormatMatcherMode,
  ReleaseProfile,
  ReleaseProtocolPreference,
} from "@shared/release-profiles";

const CONDITION_OPTIONS: Array<{ value: CustomFormatConditionType; label: string }> = [
  { value: "title", label: "Title" },
  { value: "release_group", label: "Release Group" },
  { value: "uploader", label: "Uploader / Poster" },
  { value: "category", label: "Category" },
  { value: "protocol", label: "Protocol" },
];

const MATCHER_OPTIONS: Array<{ value: CustomFormatMatcherMode; label: string }> = [
  { value: "contains", label: "Contains" },
  { value: "exact", label: "Exact" },
  { value: "regex", label: "Regex" },
];

const newFormatDefaults = {
  name: "",
  description: "",
  conditionType: "title" as CustomFormatConditionType,
  matcherMode: "contains" as CustomFormatMatcherMode,
  matcherValue: "",
  score: 10,
  enabled: true,
  hardReject: false,
  builtIn: false,
};

export default function ReleaseScoringSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [profileDraft, setProfileDraft] = useState<ReleaseProfile | null>(null);
  const [formatDrafts, setFormatDrafts] = useState<CustomFormat[]>([]);
  const [newFormat, setNewFormat] = useState(newFormatDefaults);

  const { data: profiles = [] } = useQuery<ReleaseProfile[]>({
    queryKey: ["/api/release-profiles"],
  });
  const { data: formats = [] } = useQuery<CustomFormat[]>({
    queryKey: ["/api/custom-formats"],
  });

  const defaultProfile = profiles[0] ?? null;
  const sortedFormats = useMemo(
    () =>
      [...formatDrafts].sort((a, b) => {
        if (a.builtIn !== b.builtIn) return Number(b.builtIn) - Number(a.builtIn);
        return a.name.localeCompare(b.name);
      }),
    [formatDrafts]
  );

  useEffect(() => {
    if (defaultProfile) setProfileDraft(defaultProfile);
  }, [defaultProfile]);

  useEffect(() => {
    setFormatDrafts(formats);
  }, [formats]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/release-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["/api/custom-formats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/search"] });
  };

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!profileDraft) return null;
      const res = await apiRequest("PATCH", `/api/release-profiles/${profileDraft.id}`, {
        name: profileDraft.name,
        minScore: profileDraft.minScore,
        preferredPlatform: profileDraft.preferredPlatform,
        protocolPreference: profileDraft.protocolPreference,
        minSeeders: profileDraft.minSeeders,
        maxSize: profileDraft.maxSize,
        requiredTerms: profileDraft.requiredTerms,
        ignoredTerms: profileDraft.ignoredTerms,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "Release profile saved" });
      invalidate();
    },
  });

  const saveFormatMutation = useMutation({
    mutationFn: async (format: CustomFormat) => {
      const res = await apiRequest("PATCH", `/api/custom-formats/${format.id}`, {
        name: format.name,
        description: format.description,
        conditionType: format.conditionType,
        matcherMode: format.matcherMode,
        matcherValue: format.matcherValue,
        score: format.score,
        enabled: format.enabled,
        hardReject: format.hardReject,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "Custom format saved" });
      invalidate();
    },
  });

  const addFormatMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/custom-formats", newFormat);
      return res.json();
    },
    onSuccess: () => {
      setNewFormat(newFormatDefaults);
      toast({ description: "Custom format added" });
      invalidate();
    },
  });

  const deleteFormatMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/custom-formats/${id}`);
    },
    onSuccess: () => {
      toast({ description: "Custom format deleted" });
      invalidate();
    },
  });

  const updateFormatDraft = (id: string, updates: Partial<CustomFormat>) => {
    setFormatDrafts((current) =>
      current.map((format) => (format.id === id ? { ...format, ...updates } : format))
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Release Profile & Custom Formats</CardTitle>
        <CardDescription>
          Score releases before sorting. Release groups are now custom formats, not a separate
          filter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {profileDraft && (
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Minimum Score</Label>
              <Input
                type="number"
                value={profileDraft.minScore}
                onChange={(e) =>
                  setProfileDraft({ ...profileDraft, minScore: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Preferred Platform</Label>
              <Select
                value={profileDraft.preferredPlatform ?? "__none__"}
                onValueChange={(value) =>
                  setProfileDraft({
                    ...profileDraft,
                    preferredPlatform: value === "__none__" ? null : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No preference</SelectItem>
                  {CANONICAL_PLATFORMS.map((platform) => (
                    <SelectItem key={platform} value={platform}>
                      {platform}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Protocol Preference</Label>
              <Select
                value={profileDraft.protocolPreference}
                onValueChange={(value) =>
                  setProfileDraft({
                    ...profileDraft,
                    protocolPreference: value as ReleaseProtocolPreference,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="either">Either</SelectItem>
                  <SelectItem value="usenet">Usenet</SelectItem>
                  <SelectItem value="torrent">Torrent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="gap-2"
                onClick={() => saveProfileMutation.mutate()}
                disabled={saveProfileMutation.isPending}
              >
                <Save className="h-4 w-4" />
                Save Profile
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Enabled</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Match</th>
                <th className="px-3 py-2 font-medium">Value</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Reject</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedFormats.map((format) => (
                <tr key={format.id} className="border-t">
                  <td className="px-3 py-2">
                    <Switch
                      checked={format.enabled}
                      onCheckedChange={(enabled) => updateFormatDraft(format.id, { enabled })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={format.name}
                      onChange={(e) => updateFormatDraft(format.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={format.conditionType}
                      disabled={format.builtIn}
                      onValueChange={(conditionType) =>
                        updateFormatDraft(format.id, {
                          conditionType: conditionType as CustomFormatConditionType,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="builtin">Built-in</SelectItem>
                        {CONDITION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={format.matcherMode}
                      disabled={format.builtIn}
                      onValueChange={(matcherMode) =>
                        updateFormatDraft(format.id, {
                          matcherMode: matcherMode as CustomFormatMatcherMode,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="builtin">Built-in</SelectItem>
                        {MATCHER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={format.matcherValue}
                      disabled={format.builtIn}
                      onChange={(e) =>
                        updateFormatDraft(format.id, { matcherValue: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      value={format.score}
                      onChange={(e) =>
                        updateFormatDraft(format.id, { score: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Switch
                      checked={format.hardReject}
                      onCheckedChange={(hardReject) => updateFormatDraft(format.id, { hardReject })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveFormatMutation.mutate(format)}
                      >
                        Save
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={format.builtIn}
                        onClick={() => deleteFormatMutation.mutate(format.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[1.2fr_1fr_1fr_1fr_100px_auto]">
          <Input
            placeholder="Format name"
            value={newFormat.name}
            onChange={(e) => setNewFormat({ ...newFormat, name: e.target.value })}
          />
          <Select
            value={newFormat.conditionType}
            onValueChange={(conditionType) =>
              setNewFormat({
                ...newFormat,
                conditionType: conditionType as CustomFormatConditionType,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={newFormat.matcherMode}
            onValueChange={(matcherMode) =>
              setNewFormat({ ...newFormat, matcherMode: matcherMode as CustomFormatMatcherMode })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATCHER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Value"
            value={newFormat.matcherValue}
            onChange={(e) => setNewFormat({ ...newFormat, matcherValue: e.target.value })}
          />
          <Input
            type="number"
            value={newFormat.score}
            onChange={(e) => setNewFormat({ ...newFormat, score: Number(e.target.value) || 0 })}
          />
          <Button
            className="gap-2"
            disabled={!newFormat.name.trim() || !newFormat.matcherValue.trim()}
            onClick={() => addFormatMutation.mutate()}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
