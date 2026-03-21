import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useRelays } from "../hooks/useRelays";
import { useToast } from "../components/Toast";
import { publishRepo, DEFAULT_RELAYS, fetchProfiles, shortenKey } from "../lib/nostr";
import { initLocalRepo, pushToBlossom } from "../lib/gitBlossom";
import type { UserProfile } from "../types/nostr";

const RANDOM_NAMES = [
  "silver-octo-bassoon", "turbo-barnacle", "fuzzy-disco-lamp",
  "cosmic-waffle-train", "shiny-palm-tree", "fluffy-doodle-bot",
  "miniature-spork", "zappy-pancake", "legendary-fiesta",
  "scaling-adventure", "super-duper-meme", "friendly-rotary-phone",
  "redesigned-umbrella", "upgraded-telegram", "curly-succotash",
  "psychic-broccoli", "probable-chainsaw", "verbose-guacamole",
];

const GITIGNORE_TEMPLATES = [
  "None", "Node", "Python", "Rust", "Go", "Java", "C", "C++",
  "Ruby", "Swift", "Kotlin", "Haskell", "Elixir", "Dart",
];

const LICENSE_OPTIONS = [
  { id: "", label: "None" },
  { id: "MIT", label: "MIT License" },
  { id: "Apache-2.0", label: "Apache License 2.0" },
  { id: "GPL-3.0", label: "GNU GPLv3" },
  { id: "AGPL-3.0", label: "GNU AGPLv3" },
  { id: "BSD-2-Clause", label: "BSD 2-Clause" },
  { id: "BSD-3-Clause", label: "BSD 3-Clause" },
  { id: "MPL-2.0", label: "Mozilla Public License 2.0" },
  { id: "Unlicense", label: "The Unlicense" },
];

const DESC_MAX = 350;

export default function NewRepoPage() {
  const { pubkey, signer } = useAuth();
  const { globalRelays } = useRelays();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const [addReadme, setAddReadme] = useState(false);
  const [gitignore, setGitignore] = useState("None");
  const [license, setLicense] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [suggestedName] = useState(
    () => RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]
  );

  useEffect(() => {
    if (!pubkey) return;
    let cancelled = false;
    fetchProfiles([pubkey], globalRelays.length > 0 ? globalRelays : DEFAULT_RELAYS).then((p) => {
      if (cancelled) return;
      setProfile(p.get(pubkey) ?? null);
    });
    return () => { cancelled = true; };
  }, [pubkey, globalRelays]);

  if (!pubkey || !signer) {
    return (
      <div className="text-center py-20">
        <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" className="mx-auto mb-4 text-text-muted">
          <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
        </svg>
        <p className="text-text-secondary mb-3">Sign in to create a repository</p>
        <Link to="/login" className="btn btn-primary no-underline hover:no-underline">
          Sign in
        </Link>
      </div>
    );
  }

  const identifier = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const ownerName = profile?.displayName || profile?.name || shortenKey(pubkey);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Repository name is required");
      return;
    }
    setPublishing(true);
    setError("");

    const repoTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (license) repoTags.push(`license:${license}`);
    if (gitignore !== "None") repoTags.push(`gitignore:${gitignore}`);
    if (addReadme) repoTags.push("has-readme");
    if (visibility === "unlisted") repoTags.push("unlisted");

    try {
      const cloneUrls: string[] = cloneUrl.trim() ? [cloneUrl.trim()] : [];
      const needsInit = addReadme || gitignore !== "None" || license;

      // Initialize git repo in browser and push to Blossom if initializing with files
      if (needsInit) {
        const dir = `/${pubkey}-${identifier}`;
        const authorName = profile?.displayName || profile?.name || shortenKey(pubkey);

        setPublishStatus("Initializing repository...");
        await initLocalRepo(dir, {
          name: name.trim(),
          description: description.trim(),
          addReadme,
          license: license || undefined,
          gitignore: gitignore !== "None" ? gitignore : undefined,
          authorName,
          authorEmail: `${shortenKey(pubkey)}@nostr`,
        });

        setPublishStatus("Uploading to Blossom...");
        const blossomUrl = await pushToBlossom(signer, dir, undefined, (msg) =>
          setPublishStatus(msg),
        );
        cloneUrls.push(blossomUrl);
      }

      setPublishStatus("Publishing to Nostr...");
      await publishRepo(signer, {
        identifier,
        name: name.trim(),
        description: description.trim(),
        cloneUrls,
        webUrls: webUrl.trim() ? [webUrl.trim()] : [],
        relays: DEFAULT_RELAYS,
        tags: repoTags,
      });
      toast("Repository created successfully!", "success");
      navigate(`/repo/${pubkey}/${identifier}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
      setPublishStatus("");
    }
  };

  return (
    <div className="max-w-[660px] mx-auto animate-fadeIn">
      {/* Page header */}
      <div className="mb-6 pb-4 border-b border-border">
        <h1 className="text-2xl font-semibold">Create a new repository</h1>
        <p className="text-sm text-text-secondary mt-1">
          Repositories contain a project's files and version history. Have a project elsewhere?{" "}
          <span className="text-accent">Import a repository.</span>
        </p>
      </div>

      <p className="text-xs text-text-muted mb-6">
        Required fields are marked with an asterisk (<span className="text-red">*</span>).
      </p>

      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-4 bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red flex items-start gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 mt-0.5">
              <path d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* ── Section 1: General ── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
            <h2 className="text-base font-semibold">General</h2>
          </div>

          {/* Owner / Name row */}
          <label className="text-sm font-medium text-text-primary block mb-2">
            Repository owner and name
          </label>
          <div className="flex items-center gap-2 mb-1">
            {/* Owner */}
            <div className="flex items-center gap-2 bg-bg-secondary border border-border rounded-lg px-3 py-2 shrink-0">
              {profile?.picture ? (
                <img src={profile.picture} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-accent text-[10px] font-bold">
                  {ownerName[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm text-text-primary font-medium">{ownerName}</span>
            </div>

            <span className="text-text-muted text-lg font-light">/</span>

            {/* Repo name */}
            <div className="flex-1">
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(""); }}
                placeholder="repository-name"
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                required
              />
            </div>
            <span className="text-red text-sm">*</span>
          </div>

          {name ? (
            <p className="text-xs text-text-muted mb-4">
              Your repository will be created as <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-accent font-mono">{ownerName}/{identifier}</code>
            </p>
          ) : (
            <p className="text-xs text-text-muted mb-4">
              Great repository names are short and memorable. How about{" "}
              <button
                type="button"
                onClick={() => setName(suggestedName)}
                className="text-accent hover:underline bg-transparent border-0 cursor-pointer p-0 text-xs font-medium"
              >
                {suggestedName}
              </button>
              ?
            </p>
          )}

          {/* Description */}
          <label className="text-sm font-medium text-text-primary block mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => { if (e.target.value.length <= DESC_MAX) setDescription(e.target.value); }}
            placeholder="A short description of your repository"
            rows={2}
            className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary resize-none placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <p className="text-xs text-text-muted text-right mt-0.5">
            {description.length} / {DESC_MAX} characters
          </p>
        </div>

        <div className="border-t border-border my-6" />

        {/* ── Section 2: Configuration ── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <h2 className="text-base font-semibold">Configuration</h2>
          </div>

          {/* Visibility */}
          <label className="text-sm font-medium text-text-primary block mb-2">
            Choose visibility <span className="text-red">*</span>
          </label>
          <p className="text-xs text-text-muted mb-3">
            Nostr events are public by default. Choose how discoverable your repository should be.
          </p>
          <div className="space-y-2 mb-6">
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              visibility === "public"
                ? "border-accent bg-accent/5"
                : "border-border hover:border-text-muted"
            }`}>
              <input
                type="radio"
                name="visibility"
                checked={visibility === "public"}
                onChange={() => setVisibility("public")}
                className="mt-0.5 accent-accent"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-secondary">
                    <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
                  </svg>
                  <span className="text-sm font-medium text-text-primary">Public</span>
                </div>
                <p className="text-xs text-text-muted mt-0.5 ml-6">Listed in Explore and search. Anyone on Nostr can discover and view this repository.</p>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              visibility === "unlisted"
                ? "border-accent bg-accent/5"
                : "border-border hover:border-text-muted"
            }`}>
              <input
                type="radio"
                name="visibility"
                checked={visibility === "unlisted"}
                onChange={() => setVisibility("unlisted")}
                className="mt-0.5 accent-accent"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-secondary">
                    <path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.831.88 9.577.43 8.899a1.62 1.62 0 0 1 0-1.798c.45-.678 1.367-1.932 2.637-3.023C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.824.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z" />
                  </svg>
                  <span className="text-sm font-medium text-text-primary">Unlisted</span>
                </div>
                <p className="text-xs text-text-muted mt-0.5 ml-6">Not shown in Explore or search. Anyone with the direct link can still view it.</p>
              </div>
            </label>
          </div>

          <div className="border-t border-border my-5" />

          {/* Initialize options */}
          <p className="text-xs text-text-muted mb-4">Initialize this repository with:</p>

          {/* Add README */}
          <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-text-muted cursor-pointer mb-3 transition-colors">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-secondary">
                  <path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-9h-3.495a2.25 2.25 0 0 0-2.25 2.25Z" />
                </svg>
                <span className="text-sm font-medium text-text-primary">Add a README</span>
              </div>
              <p className="text-xs text-text-muted mt-0.5 ml-6">
                READMEs can be used as longer descriptions.{" "}
                <span className="text-accent">About READMEs</span>
              </p>
            </div>
            <div className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${addReadme ? "bg-accent" : "bg-bg-tertiary border border-border"}`}
              onClick={(e) => { e.preventDefault(); setAddReadme(!addReadme); }}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${addReadme ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
          </label>

          {/* .gitignore */}
          <div className="p-3 rounded-lg border border-border mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-secondary">
                <path d="M3.75 1.5a.25.25 0 0 0-.25.25v11.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V6H9.75A1.75 1.75 0 0 1 8 4.25V1.5ZM10 4.25v-2.5l3.5 3.25H10.5a.25.25 0 0 1-.25-.25h-.25ZM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25Z" />
              </svg>
              <span className="text-sm font-medium text-text-primary">Add .gitignore</span>
            </div>
            <p className="text-xs text-text-muted mb-2 ml-6">
              .gitignore tells git which files not to track.{" "}
              <span className="text-accent">About ignoring files</span>
            </p>
            <select
              value={gitignore}
              onChange={(e) => setGitignore(e.target.value)}
              className="ml-6 bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent cursor-pointer"
            >
              {GITIGNORE_TEMPLATES.map((t) => (
                <option key={t} value={t}>{t === "None" ? ".gitignore template: None" : t}</option>
              ))}
            </select>
          </div>

          {/* License */}
          <div className="p-3 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-1.5">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-text-secondary">
                <path d="M8.75.75V2h.985c.304 0 .603.08.867.231l1.29.736c.038.022.08.033.124.033h2.234a.75.75 0 0 1 0 1.5h-.427l2.111 4.692a.75.75 0 0 1-.154.838l-.53-.53.529.531-.001.002-.002.002-.007.007-.014.013a2.367 2.367 0 0 1-.184.158 3.854 3.854 0 0 1-.53.32c-.442.213-1.078.413-1.907.413-.829 0-1.465-.2-1.907-.413a3.854 3.854 0 0 1-.53-.32 2.367 2.367 0 0 1-.184-.158l-.014-.013-.007-.007-.002-.002v-.001l.529-.531-.53.53a.75.75 0 0 1-.154-.838L13.823 5H13.1c-.26 0-.514-.082-.733-.231l-1.29-.736a.25.25 0 0 0-.124-.033H8.75V13h2.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.5V4h-.984a.25.25 0 0 0-.124.033l-1.29.736c-.22.149-.473.231-.733.231H1.177l2.111 4.692a.75.75 0 0 1-.154.838l-.53-.53.53.531-.002.002-.007.007-.014.013a2.367 2.367 0 0 1-.184.158 3.854 3.854 0 0 1-.53.32c-.442.213-1.078.413-1.907.413-.829 0-1.465-.2-1.907-.413a3.854 3.854 0 0 1-.714-.478l-.014-.013-.007-.007-.002-.002L.75 9.78l-.53.53a.75.75 0 0 1-.154-.838L2.177 5H1.75a.75.75 0 0 1 0-1.5h2.234c.044 0 .086-.011.124-.033l1.29-.736A1.75 1.75 0 0 1 6.265 2H7.25V.75a.75.75 0 0 1 1.5 0ZM2.507 10h3.986L4.5 5.691ZM9.507 10h3.986L11.5 5.691Z" />
              </svg>
              <span className="text-sm font-medium text-text-primary">Add a license</span>
            </div>
            <p className="text-xs text-text-muted mb-2 ml-6">
              Licenses explain how others can use your code.{" "}
              <span className="text-accent">About licenses</span>
            </p>
            <select
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              className="ml-6 bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent cursor-pointer"
            >
              {LICENSE_OPTIONS.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t border-border my-6" />

        {/* ── Section 3: Links (optional) ── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
            <h2 className="text-base font-semibold">Links</h2>
            <span className="text-xs text-text-muted">(optional)</span>
          </div>
          <p className="text-xs text-text-muted mb-4">
            Point to existing hosting so users can clone or browse your code.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-text-primary block mb-1.5">Git Clone URL</label>
              <input
                type="text"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                placeholder="https://github.com/user/repo.git"
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary block mb-1.5">Web URL</label>
              <input
                type="text"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary block mb-1.5">Tags</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="rust, cli, nostr"
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <p className="text-xs text-text-muted mt-1">Comma-separated. Helps others discover your project.</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border my-6" />

        {/* Submit */}
        <div className="flex items-center gap-3 pb-8">
          <button
            type="submit"
            disabled={publishing || !name.trim()}
            className="btn btn-primary flex items-center gap-2"
          >
            {publishing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {publishStatus || "Creating repository..."}
              </>
            ) : (
              "Create repository"
            )}
          </button>
          <button type="button" onClick={() => navigate("/")} className="btn">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
