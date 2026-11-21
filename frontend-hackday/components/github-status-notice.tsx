const reasons: Record<string, string> = {
  invalid_state: "The install session expired or didn't match your account. Please try again.",
  not_your_installation: "That installation doesn't belong to your GitHub account, so it was not linked.",
  oauth_exchange_failed: "GitHub didn't confirm your identity. Please try again.",
  github_app_not_configured: "The GitHub App isn't fully configured on the server yet.",
  missing_params: "GitHub returned an incomplete response. Please try again.",
};

export function GitHubStatusNotice({ status, reason }: { status?: string; reason?: string }) {
  if (!status) return null;

  const tone =
    status === "error"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-border bg-muted text-foreground";
  const text =
    status === "connected"
      ? "GitHub connected. Your repositories are listed below."
      : status === "pending"
        ? "Install requested. An owner of that organization has to approve it before repositories appear."
        : (reason && reasons[reason]) || "Connecting GitHub didn't complete. Please try again.";

  return (
    <p role={status === "error" ? "alert" : "status"} className={`mx-6 mt-6 rounded-lg border px-3 py-2 text-sm ${tone}`}>
      {text}
    </p>
  );
}
