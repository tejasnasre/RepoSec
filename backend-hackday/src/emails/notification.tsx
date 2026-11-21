import { Body, Button, Container, Head, Heading, Html, Hr, Preview, Section, Tailwind, Text } from "@react-email/components";

export type NotificationEmailProps = {
  title: string;
  body: string;
  link?: string | null;
  severity?: "critical" | "high" | "medium" | "low" | "info";
};

const severityColor = {
  critical: "bg-red-600",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
  info: "bg-gray-500",
} as const;

export default function NotificationEmail({ title, body, link, severity = "info" }: NotificationEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{title}</Preview>
      <Tailwind>
        <Body className="bg-white font-sans text-gray-900">
          <Container className="mx-auto max-w-[560px] px-4 py-6">
            <Section>
              <Text className={`m-0 inline-block rounded px-2 py-1 text-xs font-semibold uppercase text-white ${severityColor[severity]}`}>
                {severity}
              </Text>
            </Section>
            <Heading as="h2" className="mx-0 mb-3 mt-4 text-xl font-semibold">
              {title}
            </Heading>
            {body.split("\n").map((line, i) => (
              <Text key={i} className="my-1 text-sm leading-6">
                {line}
              </Text>
            ))}
            {link ? (
              <Section className="my-6">
                <Button href={link} className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white no-underline">
                  View full report
                </Button>
              </Section>
            ) : null}
            <Hr className="my-6 border-gray-200" />
            <Text className="m-0 text-xs text-gray-500">
              You receive this because you connected this repository to RepoSec. Change this in Settings → Notifications.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

NotificationEmail.PreviewProps = {
  title: "Analysis completed for acme/web",
  body: "3 vulnerabilities found.\n1 critical, 2 high.",
  link: "http://localhost:3000/dashboard/investigations/123",
  severity: "critical",
} satisfies NotificationEmailProps;
