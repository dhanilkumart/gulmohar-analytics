import { Card, CardContent } from "@/components/ui/card";

export function PlaceholderCard({ note }: { note: string }) {
  return (
    <Card>
      <CardContent className="text-muted-foreground py-10 text-center text-sm">
        {note}
      </CardContent>
    </Card>
  );
}
