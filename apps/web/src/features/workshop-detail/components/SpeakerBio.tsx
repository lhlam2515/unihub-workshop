import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Speaker } from "@/types/workshop";

interface SpeakerBioProps {
  speaker: Speaker | null;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SpeakerBio({ speaker }: SpeakerBioProps) {
  if (!speaker) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Diễn giả</h2>
      <div className="flex items-start gap-4">
        <Avatar size="lg">
          {speaker.avatarUrl ? (
            <AvatarImage src={speaker.avatarUrl} alt={speaker.fullName} />
          ) : (
            <AvatarFallback>{getInitials(speaker.fullName)}</AvatarFallback>
          )}
        </Avatar>
        <div className="space-y-1">
          <p className="font-medium">{speaker.fullName}</p>
          {speaker.title && (
            <p className="text-muted-foreground text-sm">{speaker.title}</p>
          )}
          {speaker.bio && (
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {speaker.bio}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
