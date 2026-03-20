import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { RelayProvider } from "./hooks/useRelays";
import { NotificationProvider } from "./hooks/useNotifications";
import { ThemeProvider } from "./hooks/useTheme";
import { KeyboardShortcutProvider } from "./hooks/useKeyboardShortcuts";
import { ToastProvider } from "./components/Toast";
import { WalletProvider } from "./hooks/useWallet";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import ExplorePage from "./pages/ExplorePage";
import NotFoundPage from "./pages/NotFoundPage";

// Lazy-loaded pages for code splitting
const LoginPage = lazy(() => import("./pages/LoginPage"));
const NewRepoPage = lazy(() => import("./pages/NewRepoPage"));
const RepoPage = lazy(() => import("./pages/RepoPage"));
const IssuePage = lazy(() => import("./pages/IssuePage"));
const NewIssuePage = lazy(() => import("./pages/NewIssuePage"));
const PatchPage = lazy(() => import("./pages/PatchPage"));
const NewPatchPage = lazy(() => import("./pages/NewPatchPage"));
const PullRequestPage = lazy(() => import("./pages/PullRequestPage"));
const NewPullRequestPage = lazy(() => import("./pages/NewPullRequestPage"));
const UserPage = lazy(() => import("./pages/UserPage"));
const ForkPage = lazy(() => import("./pages/ForkPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const SnippetsPage = lazy(() => import("./pages/SnippetsPage"));
const SnippetPage = lazy(() => import("./pages/SnippetPage"));
const NewSnippetPage = lazy(() => import("./pages/NewSnippetPage"));
const EditProfilePage = lazy(() => import("./pages/EditProfilePage"));
const ActivityPage = lazy(() => import("./pages/ActivityPage"));
const EventThreadPage = lazy(() => import("./pages/EventThreadPage"));
const RepoSettingsPage = lazy(() => import("./pages/RepoSettingsPage"));
const DiscussionsPage = lazy(() => import("./pages/DiscussionsPage"));
const WikiPage = lazy(() => import("./pages/WikiPage"));
const BountyPage = lazy(() => import("./pages/BountyPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const TopicPage = lazy(() => import("./pages/TopicPage"));
const TrendingPage = lazy(() => import("./pages/TrendingPage"));
const RepoInsightsPage = lazy(() => import("./pages/RepoInsightsPage"));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage"));
const ProjectBoardPage = lazy(() => import("./pages/ProjectBoardPage"));
const ImportPage = lazy(() => import("./pages/ImportPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const TeamsPage = lazy(() => import("./pages/TeamsPage"));

function PageLoader() {
  return (
    <div className="text-center py-20 text-text-secondary">
      <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RelayProvider>
          <NotificationProvider>
            <ToastProvider>
              <WalletProvider>
              <BrowserRouter>
                <KeyboardShortcutProvider>
                  <ErrorBoundary>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route element={<Layout />}>
                        <Route path="/" element={<ExplorePage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/notifications" element={<NotificationsPage />} />
                        <Route path="/activity" element={<ActivityPage />} />
                        <Route path="/profile/edit" element={<EditProfilePage />} />
                        <Route path="/new" element={<NewRepoPage />} />
                        <Route path="/import" element={<ImportPage />} />
                        <Route path="/snippets" element={<SnippetsPage />} />
                        <Route path="/snippets/new" element={<NewSnippetPage />} />
                        <Route path="/snippets/:snippetId" element={<SnippetPage />} />
                        <Route path="/repo/:pubkey/:identifier" element={<RepoPage />} />
                        <Route path="/repo/:pubkey/:identifier/fork" element={<ForkPage />} />
                        <Route path="/repo/:pubkey/:identifier/issues/new" element={<NewIssuePage />} />
                        <Route path="/repo/:pubkey/:identifier/issues/:issueId" element={<IssuePage />} />
                        <Route path="/repo/:pubkey/:identifier/patches/new" element={<NewPatchPage />} />
                        <Route path="/repo/:pubkey/:identifier/patches/:patchId" element={<PatchPage />} />
                        <Route path="/repo/:pubkey/:identifier/prs/new" element={<NewPullRequestPage />} />
                        <Route path="/repo/:pubkey/:identifier/prs/:prId" element={<PullRequestPage />} />
                        <Route path="/repo/:pubkey/:identifier/settings" element={<RepoSettingsPage />} />
                        <Route path="/repo/:pubkey/:identifier/discussions" element={<DiscussionsPage />} />
                        <Route path="/repo/:pubkey/:identifier/discussions/:discussionId" element={<DiscussionsPage />} />
                        <Route path="/repo/:pubkey/:identifier/wiki" element={<WikiPage />} />
                        <Route path="/repo/:pubkey/:identifier/wiki/:pageSlug" element={<WikiPage />} />
                        <Route path="/repo/:pubkey/:identifier/bounties" element={<BountyPage />} />
                        <Route path="/repo/:pubkey/:identifier/insights" element={<RepoInsightsPage />} />
                        <Route path="/repo/:pubkey/:identifier/changelog" element={<ChangelogPage />} />
                        <Route path="/repo/:pubkey/:identifier/boards" element={<ProjectBoardPage />} />
                        <Route path="/repo/:pubkey/:identifier/boards/:boardId" element={<ProjectBoardPage />} />
                        <Route path="/teams" element={<TeamsPage />} />
                        <Route path="/messages" element={<MessagesPage />} />
                        <Route path="/messages/:recipientNpub" element={<MessagesPage />} />
                        <Route path="/search" element={<SearchPage />} />
                        <Route path="/trending" element={<TrendingPage />} />
                        <Route path="/topics" element={<TopicPage />} />
                        <Route path="/topics/:tag" element={<TopicPage />} />
                        <Route path="/event/:eventId" element={<EventThreadPage />} />
                        <Route path="/user/:npubOrPubkey" element={<UserPage />} />
                        <Route path="/user/:npubOrPubkey/:tab" element={<UserPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                      </Route>
                    </Routes>
                  </Suspense>
                  </ErrorBoundary>
                </KeyboardShortcutProvider>
              </BrowserRouter>
              </WalletProvider>
            </ToastProvider>
          </NotificationProvider>
        </RelayProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
