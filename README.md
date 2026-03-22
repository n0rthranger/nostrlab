# NostrLab

A decentralized GitHub alternative built on the [Nostr protocol](https://nostr.com). Create repositories, file issues, submit patches, review pull requests, and collaborate on code -- all without centralized servers. Data lives on Nostr relays and is signed with your cryptographic identity.

**Live at [nostrlab.com](https://nostrlab.com)**

## Features

### Code Hosting & Browsing
- **Repository hosting** -- Store code files as Nostr events (NIP-34 / kind 31617), with branches, file history, and ZIP download
- **Blossom integration** -- Push and clone git repos as packfiles via decentralized [Blossom](https://github.com/hzrd149/blossom) storage servers
- **Browser-based git clone** -- Clone repos directly in the browser using isomorphic-git with full commit history (up to 100 commits)
- **Auto-refresh clones** -- Browser clones automatically refresh when upstream changes are detected (Blossom URL change or HTTP re-fetch)
- **Graceful clone fallback** -- If a git clone fails (404, CORS, broken URL), silently falls back to Nostr-native file browsing
- **`git://` URL support** -- Automatically converts `git://` URLs to `https://` for browser cloning
- **Git blame** -- Annotated blame view with syntax highlighting
- **Commit history** -- GitHub-style commit timeline with full commit details
- **Code search** -- Full-text search across repository files
- **File search** -- Fuzzy file name search within repos
- **Import from GitHub** -- Pull a public GitHub repo's files into Nostr

### Collaboration
- **Issues & patches** -- Create issues (kind 1621), submit patches (kind 1617), and open pull requests (kind 1618) with inline diff comments
- **Code review** -- Approve, request changes, or comment on patches and PRs
- **Inline diff comments** -- Comment on specific lines of code in diffs
- **Discussions** -- Per-repo threaded discussions
- **Encrypted DMs** -- NIP-17 gift-wrapped direct messages

### Identity & Security
- **NIP-49 encrypted key storage** -- Private keys encrypted with scrypt + XChaCha20-Poly1305; password stored in sessionStorage (cleared on tab close)
- **NIP-07 extension support** -- Sign events with browser extensions (nos2x, Alby, Flamingo) or a local nsec key
- **Rate-limited unlock** -- Exponential backoff lockout after failed password attempts
- **XSS protection** -- DOMPurify sanitization on all rendered HTML (blame view, markdown)
- **Path traversal protection** -- Validated file paths prevent directory escape in git operations
- **Encrypted repos** -- AES-GCM encryption for private repositories

### Social & Discovery
- **Zaps** -- Tip contributors with Lightning via NIP-57 zap invoices
- **Stars** -- Star/unstar repos (NIP-25 reactions)
- **Forks** -- Fork any repo with one click; file blobs are copied to your identity
- **Bounties** -- Post sats bounties on issues
- **Teams** -- Create team rosters with owner/admin/member roles
- **Code snippets** -- Share standalone code snippets (kind 1337)
- **Trending & search** -- Explore trending repos, search by topic, and browse by tag
- **Real-time updates** -- Live relay subscriptions push file changes and comments instantly

## Running locally

```bash
# Install dependencies
npm install

# Start dev server (default: http://localhost:5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Lint
npm run lint
```

## Environment variables

No environment variables are required. The app runs entirely client-side and connects directly to public Nostr relays. Relay URLs are configured in `src/lib/config.ts` and can be customized per-user in Settings.

## Folder structure

```
src/
  components/      UI components
    BlameView.tsx           Git blame annotation view (DOMPurify-sanitized)
    CIStatusBadge.tsx       CI pipeline status indicator
    CodeBrowser.tsx         Git-backed file browser (isomorphic-git + Blossom)
    CodeSearch.tsx          Full-text code search
    CommentReactions.tsx    Reaction buttons for comments
    CommentThread.tsx       Threaded comment display + reply
    CommitDetail.tsx        Single commit detail view
    CommitHistory.tsx       GitHub-style commit timeline
    ContributionGraph.tsx   GitHub-style contribution heatmap
    DiffView.tsx            Unified diff renderer
    ErrorBoundary.tsx       React error boundary
    FileSearch.tsx          Fuzzy file name search
    FileTree.tsx            Sidebar directory tree
    FileViewer.tsx          Syntax-highlighted file display
    FollowButton.tsx        Follow/unfollow a user (NIP-02)
    ForkDiffView.tsx        Side-by-side fork comparison
    ImageUpload.tsx         NIP-96 media upload
    InlineDiffView.tsx      Inline diff comments on specific lines
    Layout.tsx              App shell (navbar, sidebar, footer)
    MarkdownContent.tsx     Markdown renderer (react-markdown)
    MarkdownEditor.tsx      Markdown editing with preview
    NostrCodeBrowser.tsx    Nostr-native file browser (kind 31617)
    NostrLabLogo.tsx        Flask + zap bolt SVG logo
    NotificationBell.tsx    Notification indicator
    OfflineBanner.tsx       Offline status indicator
    RelayStatusIndicator.tsx  Relay connection health
    RepoCard.tsx            Repository summary card
    RepoRefs.tsx            Branch/tag reference list
    ReviewButton.tsx        Code review verdict button
    ReviewList.tsx          List of reviews on a PR/patch
    SponsorTab.tsx          Zap-based sponsorship display
    StarButton.tsx          Star/unstar a repo (NIP-25 reaction)
    StatusBadge.tsx         Open/closed/merged status pill
    Toast.tsx               Toast notification system
    UnlockScreen.tsx        Password unlock with rate limiting
    WebhookSettings.tsx     Webhook configuration UI
    ZapButton.tsx           Lightning zap button

  pages/            Route-level page components
    ActivityPage        Global activity feed
    BountyHuntPage      Browse available bounties
    BountyPage          Repo bounties
    ChangelogPage       Repo release notes
    DiscussionsPage     Repo discussions
    EditProfilePage     Profile editor
    EventThreadPage     Single-event thread view
    ExplorePage         Homepage / explore repos
    ForkPage            Fork a repository
    HelpPage            Help / documentation
    ImportPage          Import from GitHub
    IssuePage           Single issue view
    LoginPage           nsec / extension login
    MessagesPage        Encrypted DMs (NIP-17)
    NewIssuePage        Create a new issue
    NewPatchPage        Submit a new patch
    NewPullRequestPage  Open a new pull request
    NewRepoPage         Create a new repository
    NewSnippetPage      Create a code snippet
    NotFoundPage        404 page
    NotificationsPage   Notification inbox
    PatchPage           Single patch view
    ProjectBoardPage    Kanban project board
    PullRequestPage     Single PR view
    RepoInsightsPage    Repo analytics
    RepoPage            Main repository view (code, issues, PRs)
    RepoSettingsPage    Repo settings
    SearchPage          Global search
    SettingsPage        User settings (relays, theme, keys)
    SnippetPage         Single snippet view
    SnippetsPage        Browse snippets
    TeamsPage           Team management
    TopicPage           Browse repos by topic tag
    TrendingPage        Trending repositories
    UserPage            User profile

  hooks/            React hooks
    useAuth.tsx              Authentication state (NIP-49 + NIP-07)
    useKeyboardShortcuts.tsx Global keyboard shortcut registry
    useNotifications.tsx     Notification polling
    useRelays.tsx            Relay list management
    useRelayStatus.ts        Relay connection health checks
    useSubscription.ts       Live Nostr event subscriptions
    useTheme.tsx             Dark/light theme toggle
    useWallet.tsx            Wallet / zap integration

  lib/              Utilities and data layer
    blossom.ts        Blossom blob upload/download (NIP-98 auth)
    cache.ts          IndexedDB query cache (stale-while-revalidate)
    config.ts         All configurable constants (relays, limits, timeouts)
    crypto.ts         AES-GCM encryption/decryption for private repos
    diff.ts           Unified diff parser
    git.ts            isomorphic-git operations (clone, log, blame)
    gitBlossom.ts     Git packfile export/import via Blossom storage
    nostr.ts          Core Nostr data layer (fetch, parse, publish)
    webhooks.ts       Webhook trigger system
    zip.ts            ZIP file generation (no dependencies)

  types/
    nostr.ts          TypeScript interfaces and Nostr event kind constants

  App.tsx             Route definitions
  main.tsx            Entry point
```

## Key technologies

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 |
| Routing | React Router 7 |
| Nostr | nostr-tools 2.x |
| Git | isomorphic-git + LightningFS |
| Blossom | Decentralized blob storage for git packfiles |
| Markdown | react-markdown 10 + remark-gfm |
| Syntax highlighting | highlight.js 11 |
| Sanitization | DOMPurify |
| Caching | IndexedDB via idb |

## Nostr protocol usage

This app implements several Nostr Improvement Proposals:

| NIP | Purpose |
|-----|---------|
| NIP-01 | Basic protocol, profile metadata (kind 0) |
| NIP-02 | Contact list / following (kind 3) |
| NIP-07 | Browser extension signing |
| NIP-09 | Event deletion (kind 5) |
| NIP-22 | Comments (kind 1111) |
| NIP-25 | Reactions (kind 7) |
| NIP-34 | Git repos, patches, issues (kinds 30617, 1617, 1621, etc.) |
| NIP-49 | Encrypted private key storage (scrypt + XChaCha20-Poly1305) |
| NIP-57 | Zaps (kinds 9734, 9735) |
| NIP-96 | Media upload with NIP-98 HTTP auth |
| NIP-17/59 | Encrypted DMs (gift wrap) |

## Blossom Integration

NostrLab uses [Blossom](https://github.com/hzrd149/blossom) for decentralized git hosting:

- **Push**: Exports the entire git repo as a packfile and uploads it to a Blossom server. The resulting URL (with HEAD commit OID as a fragment) is stored in the repo's NIP-34 clone URL list.
- **Clone**: Downloads the packfile, indexes it with isomorphic-git, and checks out the latest commit -- all in the browser.
- **Auto-refresh**: When the Blossom packfile URL changes (new push), the browser clone automatically re-fetches.

The `git-remote-blossom` CLI helper and `cli/` directory provide command-line tools for interacting with Blossom-hosted repos.

## License

See LICENSE file for details.
