import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionPubkey } from "@/lib/session";
import { CommunitySettingsForm } from "@/components/communities/CommunitySettingsForm";

export const dynamic = "force-dynamic";

export default async function CommunitySettingsPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const pubkey = await getSessionPubkey();
  if (!pubkey) notFound();

  const community = await prisma.community.findUnique({
    where: { slug },
    include: {
      tags: true,
      moderators: true,
    },
  });
  if (!community || community.organizerPubkey !== pubkey) notFound();

  return (
    <div className="max-w-2xl mx-auto px-5 py-10 md:py-14">
      <Link href={`/communities/${community.slug}`} className="text-sm text-muted hover:text-fg">
        Back to community
      </Link>
      <header className="mt-5 mb-8">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] mb-3 bg-gradient-to-r from-violet-600 to-orange-500 bg-clip-text text-transparent">
          Community settings
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.025em]">
          Manage {community.name}
        </h1>
        <p className="text-muted mt-2">
          Edit the public profile, approved hosts, verification link, and ownership.
        </p>
      </header>

      <CommunitySettingsForm
        initial={{
          id: community.id,
          slug: community.slug,
          name: community.name,
          description: community.description,
          imageUrl: community.imageUrl,
          website: community.website,
          tags: community.tags.map((t) => t.tag),
          moderators: community.moderators.map((m) => m.pubkey),
        }}
      />
    </div>
  );
}
