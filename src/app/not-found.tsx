import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Root 404 page. Next renders this for any unmatched route and for
 * `notFound()` calls from within server components/actions. Without
 * it users see the framework's unbranded 404.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Page not found</CardTitle>
          <CardDescription>
            That link doesn&apos;t exist or the record was removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          If you got here from an email or notification, try opening the link
          from within the app instead.
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/dashboard">
            <Button>Back to dashboard</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
