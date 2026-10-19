# The Bedrock Guardrail every traveller message goes through before any model
# sees it (TRA-292, ADR 0032 "Guardrails"). ai_api calls `ApplyGuardrail` on
# the message alone (source INPUT): the model's own prose is filtered in the
# app (no price figures) and its places are corpus ids, so nothing is checked
# on output. ai_api writes its own sentences when a message is stopped; the
# blocked messaging below is never shown.
#
# Off with `planner_guardrail_enabled = false`: the Lambda then gets empty
# BEDROCK_GUARDRAIL_* variables and checks nothing. The guard fails open, so
# an outage of this service never stops the planner.

resource "aws_bedrock_guardrail" "planner" {
  count = var.planner_guardrail_enabled ? 1 : 0

  name                      = "${var.name_prefix}-planner"
  description               = "Traveller messages to the trip planner: attacks, harm, card numbers, unrelated asks."
  blocked_input_messaging   = "Sorry, I can't help with that."
  blocked_outputs_messaging = "Sorry, I can't help with that."

  content_policy_config {
    dynamic "filters_config" {
      for_each = toset(["HATE", "INSULTS", "SEXUAL", "VIOLENCE", "MISCONDUCT"])
      content {
        type            = filters_config.value
        input_strength  = "MEDIUM"
        output_strength = "MEDIUM"
      }
    }

    # Only on input: PROMPT_ATTACK takes no output strength.
    filters_config {
      type            = "PROMPT_ATTACK"
      input_strength  = "HIGH"
      output_strength = "NONE"
    }
  }

  sensitive_information_policy_config {
    dynamic "pii_entities_config" {
      for_each = toset([
        "CREDIT_DEBIT_CARD_NUMBER",
        "CREDIT_DEBIT_CARD_CVV",
        "INTERNATIONAL_BANK_ACCOUNT_NUMBER",
      ])
      content {
        type           = pii_entities_config.value
        action         = "BLOCK"
        input_action   = "BLOCK"
        input_enabled  = true
        output_enabled = false
      }
    }
  }

  topic_policy_config {
    topics_config {
      name       = "Unrelated tasks"
      type       = "DENY"
      definition = "Requests unrelated to travel or trip planning, such as writing code, homework, or general-purpose assistant tasks."
      examples = [
        "Write me a Python script that sorts a list of numbers.",
        "Solve this algebra homework for me.",
        "Draft a cover letter for my job application.",
      ]
    }
  }

  tags = var.tags
}

# The numbered snapshot ai_api calls. A change to the guardrail above makes a
# new version (and the Lambda's variable follows); the old one is kept so a
# function still running on it never calls a version that is gone.
resource "aws_bedrock_guardrail_version" "planner" {
  count = var.planner_guardrail_enabled ? 1 : 0

  guardrail_arn = aws_bedrock_guardrail.planner[0].guardrail_arn
  description   = "Managed by Terraform (guardrail.tf)."
  skip_destroy  = true

  lifecycle {
    replace_triggered_by = [aws_bedrock_guardrail.planner[0]]
  }
}
