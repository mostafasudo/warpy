import { Mail } from "lucide-react"

import { PanelShell } from "@/components/panel-shell"
import { Button } from "@/components/ui/button"

const supportEmail = "support@warpy.ai"

export const ContactPanel = () => (
  <PanelShell title="Contact Us" description="Reach our support team for any help you need.">
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          For all support inquiries, please contact us at{" "}
          <a className="font-medium text-foreground underline underline-offset-4" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
          .
        </p>
      </div>
      <Button asChild variant="secondary" className="w-fit">
        <a href={`mailto:${supportEmail}`}>
          <Mail />
          Email support
        </a>
      </Button>
    </div>
  </PanelShell>
)

