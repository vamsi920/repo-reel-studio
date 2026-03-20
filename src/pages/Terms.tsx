import { LegalLayout } from "@/components/legal/LegalLayout";

const Terms = () => {
  return (
    <LegalLayout
      title="Terms of Service"
      updated="January 2026"
      summary="The service rules, account responsibilities, acceptable use boundaries, and liability posture that govern use of GitFlick."
      contactEmail="legal@gitflick.app"
      highlights={[
        {
          label: "Eligibility",
          value: "Some product surfaces require an account, and you are responsible for activity performed under that account.",
        },
        {
          label: "Submitted repositories",
          value: "You retain ownership of your content, but you must have the rights required to submit and process it through the service.",
        },
        {
          label: "AI output",
          value: "Generated walkthroughs and narration may contain inaccuracies and should be reviewed before reuse or publication.",
        },
      ]}
    >
      <p>
        Welcome to GitFlick. By accessing or using our service, you agree to be bound by these Terms of Service. If you do not agree, please do not use GitFlick.
      </p>

      <section>
        <h2>1. Description of Service</h2>
        <p>
          GitFlick provides a platform that analyzes GitHub repositories and generates video walkthroughs using AI. The service may include ingestion of repository content, AI-powered narration and scripting, video rendering, and storage of your projects and videos.
        </p>
      </section>

      <section>
        <h2>2. Accounts and Eligibility</h2>
        <p>
          You must be at least 13 years old to use GitFlick. Some features require an account. You are responsible for keeping your account credentials secure and for all activity under your account. You must provide accurate information when signing up.
        </p>
      </section>

      <section>
        <h2>3. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use GitFlick for any illegal purpose or in violation of any laws.</li>
          <li>Submit repositories or content you do not have the right to use, or that infringe others’ intellectual property or privacy.</li>
          <li>Attempt to gain unauthorized access to our systems, other users’ accounts, or any third-party services we use.</li>
          <li>Abuse, overload, or disrupt the service or our infrastructure.</li>
          <li>Use the service to generate misleading, harmful, or offensive content.</li>
        </ul>
        <p>
          We may suspend or terminate your access if we reasonably believe you have violated these terms or for other operational or legal reasons.
        </p>
      </section>

      <section>
        <h2>4. Your Content and Licenses</h2>
        <p>
          You retain ownership of your repository code and any content you provide. By using GitFlick, you grant us a limited license to use, process, and store that content as necessary to provide the service. You are responsible for ensuring you have the rights to any repositories or content you submit. Generated videos may incorporate AI-generated narration and visuals; we do not claim ownership of your source content.
        </p>
      </section>

      <section>
        <h2>5. Our Intellectual Property</h2>
        <p>
          GitFlick’s name, branding, software, and materials, excluding your content and third-party components, are our intellectual property. You may not copy, modify, or create derivative works of our service or materials without our written permission.
        </p>
      </section>

      <section>
        <h2>6. Disclaimers</h2>
        <p>
          GitFlick is provided "as is" and "as available." We do not warrant that the service will be uninterrupted, error-free, or free of harmful components. AI-generated output may contain inaccuracies. You use the service at your own risk.
        </p>
      </section>

      <section>
        <h2>7. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, GitFlick and its affiliates, officers, and employees shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, data, or goodwill, arising from your use of the service. Our total liability shall not exceed the amount you paid us in the twelve months preceding the claim, or one hundred dollars ($100 USD), whichever is greater.
        </p>
      </section>

      <section>
        <h2>8. Changes</h2>
        <p>
          We may modify these Terms at any time. We will post the updated Terms on this page and update the "Last updated" date. Material changes may be communicated via email or a notice in the service. Continued use of GitFlick after changes constitutes acceptance of the new Terms.
        </p>
      </section>

      <section>
        <h2>9. Contact</h2>
        <p>
          For questions about these Terms, contact us at <a href="mailto:legal@gitflick.app">legal@gitflick.app</a>.
        </p>
      </section>
    </LegalLayout>
  );
};

export default Terms;
