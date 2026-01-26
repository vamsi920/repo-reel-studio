import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import iconUrl from "../../icon.png";

const Privacy = () => {
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
              <h1 className="text-2xl font-bold text-foreground">Privacy Policy</h1>
              <p className="text-sm text-muted-foreground">Last updated: January 2026</p>
            </div>
          </div>

          <div className="max-w-none space-y-6 text-foreground">
            <p className="text-muted-foreground leading-relaxed">
              GitFlick ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service to transform GitHub repositories into video walkthroughs.
            </p>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">1. Information We Collect</h2>
              <p className="text-muted-foreground leading-relaxed mb-2">
                We collect information you provide directly and information we obtain when you use our service:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li><strong className="text-foreground">Account information:</strong> When you sign up, we collect your email address and any name or profile information you provide (e.g., via Supabase Auth).</li>
                <li><strong className="text-foreground">Repository data:</strong> When you submit a GitHub repository URL, we access and process the repository’s code and structure to generate videos. We do not store the full contents of your repository beyond what is needed for generating and serving your video.</li>
                <li><strong className="text-foreground">Usage data:</strong> We collect usage information such as actions you take in the app, project and video metadata, and basic analytics to operate and improve the service.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">2. How We Use Your Information</h2>
              <p className="text-muted-foreground leading-relaxed">
                We use the information we collect to: provide, maintain, and improve GitFlick; generate videos from your repositories using AI (including Google Gemini and text-to-speech services); authenticate you and manage your account; send you service-related communications; and comply with legal obligations.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">3. Third-Party Services</h2>
              <p className="text-muted-foreground leading-relaxed mb-2">
                We use trusted third parties to run GitFlick:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li><strong className="text-foreground">Supabase:</strong> Authentication, database, and storage. Their privacy policy applies to data they process on our behalf.</li>
                <li><strong className="text-foreground">Google (Gemini, Cloud TTS):</strong> AI analysis and narration. Repository and script content may be sent to Google APIs to generate videos and voice. Google’s privacy policy applies to that processing.</li>
                <li><strong className="text-foreground">GitHub:</strong> We access only the repositories you explicitly submit. We do not access your GitHub account beyond the specific repo URLs you provide.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">4. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed">
                We retain your account data and project metadata for as long as your account is active. Generated videos and related assets are stored so you can access and export them. You may request deletion of your data by contacting us.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">5. Your Rights</h2>
              <p className="text-muted-foreground leading-relaxed">
                Depending on your location, you may have rights to access, correct, delete, or restrict processing of your personal data, or to object to certain processing. To exercise these rights or ask questions, contact us at the email below.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">6. Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                We use industry-standard measures to protect your data, including secure connections, access controls, and relying on our providers’ security practices. No method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">7. Changes</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on this page and updating the "Last updated" date. Your continued use of GitFlick after changes constitutes acceptance of the revised policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">8. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                For privacy-related questions or requests, contact us at:{" "}
                <a href="mailto:privacy@gitflick.app" className="text-primary hover:underline">privacy@gitflick.app</a>.
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

export default Privacy;
