import { CommunityCreateForm } from "@/components/communities/CommunityCreateForm";

export const dynamic = "force-dynamic";

export default function NewCommunityPage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-10 md:py-14">
      <div
        className="relative rounded-3xl px-6 py-8 md:px-8 md:py-10 mb-8 border border-border overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(45% 80% at 0% 0%, rgb(167 139 250 / 0.18), transparent 60%), radial-gradient(40% 80% at 100% 100%, rgb(249 115 22 / 0.14), transparent 65%)",
        }}
      >
        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] mb-3 bg-gradient-to-r from-violet-600 to-orange-500 bg-clip-text text-transparent">
            New community
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.025em]">
            Start your own calendar.
          </h1>
          <p className="text-muted text-base md:text-lg mt-2 max-w-prose">
            Group your recurring events under a single name. Subscribers get every meetup you host on their feed.
          </p>
        </div>
      </div>
      <CommunityCreateForm />
    </div>
  );
}
