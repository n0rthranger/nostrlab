# nostr-git

A decentralized GitHub alternative built on the [Nostr protocol](https://nostr.com). Create repositories, file issues, submit patches, review pull requests, and collaborate on code -- all without centralized servers. Data lives on Nostr relays and is signed with your cryptographic identity.

## Features

- **Repository hosting** -- Store code files as Nostr events (NIP-34 / kind 31617), with branches, file history, and ZIP download
- **Issues & patches** -- Create issues (kind 1621), submit patches (kind 1617), and open pull requests (kind 1618) with inline diff comments
- **Code review** -- Approve, request changes, or comment on patches and PRs
- **Encrypted repos** -- AES-GCM encryption for private repositories
- **Zaps** -- Tip contributors with Lightning via NIP-57 zap invoices
- **Forks** -- Fork any repo with one click; file blobs are copied to your identity
- **Wiki & discussions** -- Per-repo wiki pages and threaded discussions
- **Project boards** -- Kanban-style boards for organizing issues
- **Bounties** -- Post sats bounties on issues
- **Teams** -- Create team rosters with owner/admin/member roles
- **Changelogs** -- Publish versioned release notes
- **Code snippets** -- Share standalone code snippets (kind 1337)
- **Import from GitHub** -- Pull a public GitHub repo's files into Nostr
- **Encrypted DMs** -- NIP-17 gift-wrapped direct messages
- **NIP-07 extension support** -- Sign events with browser extensions (nos2x, Alby, Flamingo) or a local nsec key
- **Real-time updates** -- Live relay subscriptions push file changes and comments instantly
- **Trending & search** -- Explore trending repos, search by topic, and browse by tag

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

Optional overrides (set in a `.env` file if needed):

| Variable | Purpose | Default |
|----------|---------|---------|
| _None required_ | All configuration is in `src/lib/config.ts` | -- |

## Folder structure

```
src/
  components/      UI components (buttons, viewers, editors, layout)
    BlameView.tsx           Git blame annotation view
    CIStatusBadge.tsx       CI pipeline status indicator
    CodeBrowser.tsx         Git-backed file browser (isomorphic-git)
    CodeSearch.tsx          Full-text code search
    CommentReactions.tsx    Reaction buttons for comments
    CommentThread.tsx       Threaded comment display + reply
    ContributionGraph.tsx   GitHub-style contribution heatmap
    DiffView.tsx            Unified diff renderer
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
    NostrLabLogo.tsx        SVG logo component
    NotificationBell.tsx    Notification indicator
    RelayStatusIndicator.tsx  Relay connection health
    RepoCard.tsx            Repository summary card
    RepoRefs.tsx            Branch/tag reference list
    ReviewButton.tsx        Code review verdict button
    ReviewList.tsx          List of reviews on a PR/patch
    SponsorTab.tsx          Zap-based sponsorship display
    StarButton.tsx          Star/unstar a repo (NIP-25 reaction)
    StatusBadge.tsx         Open/closed/merged status pill
    Toast.tsx               Toast notification system
    WebhookSettings.tsx     Webhook configuration UI
    ZapButton.tsx           Lightning zap button

  pages/            Route-level page components
    ActivityPage        Global activity feed
    ApiTokensPage       API token management
    BountyPage          Repo bounties
    ChangelogPage       Repo release notes
    DiscussionsPage     Repo discussions
    EditProfilePage     Profile editor
    EventThreadPage     Single-event thread view
    ExplorePage         Homepage / explore repos
    ForkPage            Fork a repository
    ImportPage          Import from GitHub
    IssuePage           Single issue view
    LoginPage           nsec / extension login
    MessagesPage        Encrypted DMs (NIP-17)
    NewIssuePage        Create a new issue
    NewRepoPage         Create a new repository
    NewSnippetPage      Create a code snippet
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
    WikiPage            Repo wiki

  hooks/            React hooks
    useAuth.tsx              Authentication state (nsec + NIP-07)
    useKeyboardShortcuts.tsx Global keyboard shortcut registry
    useNotifications.tsx     Notification polling
    useRelays.tsx            Relay list management
    useRelayStatus.ts        Relay connection health checks
    useSubscription.ts       Live Nostr event subscriptions
    useTheme.tsx             Dark/light theme toggle

  lib/              Utilities and data layer
    cache.ts          IndexedDB query cache (stale-while-revalidate)
    config.ts         All configurable constants (relays, limits, timeouts)
    crypto.ts         AES-GCM encryption/decryption for private repos
    diff.ts           Unified diff parser
    git.ts            isomorphic-git operations (clone, log, blame)
    i18n.ts           Internationalization strings
    nostr.ts          Core Nostr data layer (fetch, parse, publish)
    rss.ts            RSS feed generation
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
| Markdown | react-markdown 10 + remark-gfm |
| Syntax highlighting | highlight.js 11 |
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
| NIP-57 | Zaps (kinds 9734, 9735) |
| NIP-96 | Media upload with NIP-98 HTTP auth |
| NIP-17/59 | Encrypted DMs (gift wrap) |

## License

See LICENSE file for details.
