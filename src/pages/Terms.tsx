import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import iconUrl from "../../icon.png";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-16 px-4">
        <div className="container max-w-3xl mx-auto">
          <Button variant="ghost" size="sm" className="mb-8" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Link>
          </Button>

          <div className="flex items-center gap-3 mb-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <img src={iconUrl} alt="GitFlick" className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Terms of Service</h1>
              <p className="text-sm text-muted-foreground">Last updated: January 2026</p>
            </div>
          </div>

          <div className="max-w-none space-y-6 text-foreground">
            <p className="text-muted-foreground leading-relaxed">
              Welcome to GitFlick. By accessing or using our service, you agree to be bound by these Terms of Service. If you do not agree, please do not use GitFlick.
            </p>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">1. Description of Service</h2>
              <p className="text-muted-foreground leading-relaxed">
                GitFlick provides a platform that analyzes GitHub repositories and generates video walkthroughs using AI. The service may include ingestion of repository content, AI-powered narration and scripting (e.g., via Google Gemini and text-to-speech), video rendering, and storage of your projects and videos.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">2. Accounts and Eligibility</h2>
              <p className="text-muted-foreground leading-relaxed">
                You must be at least 13 years old to use GitFlick. Some features require an account. You are responsible for keeping your account credentials secure and for all activity under your account. You must provide accurate information when signing up.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">3. Acceptable Use</h2>
              <p className="text-muted-foreground leading-relaxed mb-2">
                You agree not to:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Use GitFlick for any illegal purpose or in violation of any laws.</li>
                <li>Submit repositories or content you do not have the right to use, or that infringe others’ intellectual property or privacy.</li>
                <li>Attempt to gain unauthorized access to our systems, other users’ accounts, or any third-party services we use.</li>
                <li>Abuse, overload, or disrupt the service or our infrastructure.</li>
                <li>Use the service to generate misleading, harmful, or offensive content.</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                We may suspend or terminate your access if we reasonably believe you have violated these terms or for other operational or legal reasons.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">4. Your Content and Licenses</h2>
              <p className="text-muted-foreground leading-relaxed">
                You retain ownership of your repository code and any content you provide. By using GitFlick, you grant us a limited license to use, process, and store that content as necessary to provide the service (e.g., to generate and host videos). You are responsible for ensuring you have the rights to any repositories or content you submit. Generated videos may incorporate AI-generated narration and visuals; we do not claim ownership of your source content.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">5. Our Intellectual Property</h2>
              <p className="text-muted-foreground leading-relaxed">
                GitFlick’s name, branding, software, and materials (excluding your content and third-party components) are our intellectual property. You may not copy, modify, or create derivative works of our service or materials without our written permission.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">6. Disclaimers</h2>
              <p className="text-muted-foreground leading-relaxed">
                GitFlick is provided "as is" and "as available." We do not warrant that the service will be uninterrupted, error-free, or free of harmful components. AI-generated output may contain inaccuracies. You use the service at your own risk.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">7. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                To the fullest extent permitted by law, GitFlick and its affiliates, officers, and employees shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, data, or goodwill, arising from your use of the service. Our total liability shall not exceed the amount you paid us in the twelve (12) months preceding the claim, or one hundred dollars ($100 USD), whichever is greater.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">8. Changes</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may modify these Terms at any time. We will post the updated Terms on this page and update the "Last updated" date. Material changes may be communicated via email or a notice in the service. Continued use of GitFlick after changes constitutes acceptance of the new Terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">9. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                For questions about these Terms, contact us at:{" "}
                <a href="mailto:legal@gitflick.app" className="text-primary hover:underline">legal@gitflick.app</a>.
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">© 2026 GitFlick. All rights reserved.</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Terms;
