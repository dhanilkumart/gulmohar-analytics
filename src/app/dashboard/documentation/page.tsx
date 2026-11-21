import { buildDocumentationPage } from "@/lib/docs-renderer";
import { PageContainer } from "@/components/layout/page-container";

export const metadata = {
  title: "User Documentation – Wastage & Preparation | Gulmohar Analytics",
};

export default function WastageDocumentationPage() {
  const contentHtml = buildDocumentationPage();

  return (
    <PageContainer
      title="User Documentation"
      description="Standard Operating Procedures and User Guide for Wastage & Preparation."
    >
      <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </PageContainer>
  );
}

