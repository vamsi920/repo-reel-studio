import { LegalLayout } from "@/components/legal/LegalLayout";

const Privacy = () => {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="January 2026"
      summary="How GitFlick handles account data, repository context, generated media, and the vendors involved in running the product."
      contactEmail="privacy@gitflick.app"
      highlights={[
        {
          label: "Repository access",
          value: "Only the repositories or folders you explicitly submit are processed for walkthrough generation.",
        },
        {
          label: "Storage posture",
          value: "Projects, manifests, and generated assets are retained so you can reopen, review, and export previous work.",
        },
        {
          label: "Third-party processing",
          value: "Supabase and Google services support auth, storage, AI analysis, and text-to-speech for the platform.",
        },
      ]}
    >
      <p>
        GitFlick ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service to transform GitHub repositories into video walkthroughs.
      </p>

      <section>
        <h2>1. Information We Collect</h2>
        <p>
          We collect information you provide directly and information we obtain when you use our service:
        </p>
        <ul>
          <li><strong>Account information:</strong> When you sign up, we collect your email address and any name or profile information you provide (e.g., via Supabase Auth).</li>
          <li><strong>Repository data:</strong> When you submit a GitHub repository URL, we access and process the repository’s code and structure to generate videos. We do not store the full contents of your repository beyond what is needed for generating and serving your video.</li>
          <li><strong>Usage data:</strong> We collect usage information such as actions you take in the app, project and video metadata, and basic analytics to operate and improve the service.</li>
        </ul>
      </section>

      <section>
        <h2>2. How We Use Your Information</h2>
        <p>
          We use the information we collect to provide, maintain, and improve GitFlick; generate videos from your repositories using AI, including Google Gemini and text-to-speech services; authenticate you and manage your account; send you service-related communications; and comply with legal obligations.
        </p>
      </section>

      <section>
        <h2>3. Third-Party Services</h2>
        <p>We use trusted third parties to run GitFlick:</p>
        <ul>
          <li><strong>Supabase:</strong> Authentication, database, and storage. Their privacy policy applies to data they process on our behalf.</li>
          <li><strong>Google (Gemini, Cloud TTS):</strong> AI analysis and narration. Repository and script content may be sent to Google APIs to generate videos and voice. Google’s privacy policy applies to that processing.</li>
          <li><strong>GitHub:</strong> We access only the repositories you explicitly submit. We do not access your GitHub account beyond the specific repo URLs you provide.</li>
        </ul>
      </section>

      <section>
        <h2>4. Data Retention</h2>
        <p>
          We retain your account data and project metadata for as long as your account is active. Generated videos and related assets are stored so you can access and export them. You may request deletion of your data by contacting us.
        </p>
      </section>

      <section>
        <h2>5. Your Rights</h2>
        <p>
          Depending on your location, you may have rights to access, correct, delete, or restrict processing of your personal data, or to object to certain processing. To exercise these rights or ask questions, contact us at the email below.
        </p>
      </section>

      <section>
        <h2>6. Security</h2>
        <p>
          We use industry-standard measures to protect your data, including secure connections, access controls, and relying on our providers’ security practices. No method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>7. Changes</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on this page and updating the "Last updated" date. Your continued use of GitFlick after changes constitutes acceptance of the revised policy.
        </p>
      </section>

      <section>
        <h2>8. Contact</h2>
        <p>
          For privacy-related questions or requests, contact us at <a href="mailto:privacy@gitflick.app">privacy@gitflick.app</a>.
        </p>
      </section>
    </LegalLayout>
  );
};

export default Privacy;
