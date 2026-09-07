# Two Fargate services behind one ALB, one per backend image.
#
#   core_api  — auth, users, trips. Talks to RDS.
#   ai_api    — chat streaming. No database; reaches core_api through the ALB
#               with the caller's own token when it has to persist something.

resource "aws_ecs_cluster" "main" {
  name = "${var.name_prefix}-cluster"
}

locals {
  # CORS is the only thing the backend needs to know about the frontend.
  frontend_env = {
    BACKEND_CORS_ORIGINS = var.backend_cors_origins
  }
}

module "core_api" {
  source = "./modules/ecs_service"

  name             = "${var.name_prefix}-core-api"
  region           = var.region
  cluster_id       = aws_ecs_cluster.main.id
  image            = var.core_api_image
  subnets          = aws_subnet.public[*].id
  security_groups  = [aws_security_group.ecs.id]
  target_group_arn = aws_lb_target_group.core_api.arn

  env = merge(local.frontend_env, {
    DB_SERVER = aws_db_instance.main.address
    DB_PORT   = "5432"
    DB_USER   = var.db_user
    DB_NAME   = var.db_name
  })

  secret_env = {
    SECRET_KEY           = aws_secretsmanager_secret.app["secret-key"].arn
    GOOGLE_CLIENT_ID     = aws_secretsmanager_secret.app["google-client-id"].arn
    GOOGLE_CLIENT_SECRET = aws_secretsmanager_secret.app["google-client-secret"].arn
    DB_PASSWORD          = aws_secretsmanager_secret.app["db-password"].arn
  }

  # A target group must belong to a listener before a service can register.
  depends_on = [aws_lb_listener.http]
}

module "ai_api" {
  source = "./modules/ecs_service"

  name             = "${var.name_prefix}-ai-api"
  region           = var.region
  cluster_id       = aws_ecs_cluster.main.id
  image            = var.ai_api_image
  subnets          = aws_subnet.public[*].id
  security_groups  = [aws_security_group.ecs.id]
  target_group_arn = aws_lb_target_group.ai_api.arn

  env = merge(local.frontend_env, {
    CORE_API_URL      = "http://${aws_lb.backend.dns_name}"
    NVIDIA_CHAT_MODEL = var.nvidia_chat_model
  })

  secret_env = {
    SECRET_KEY     = aws_secretsmanager_secret.app["secret-key"].arn
    NVIDIA_API_KEY = aws_secretsmanager_secret.app["nvidia-api-key"].arn
  }

  depends_on = [aws_lb_listener.http]
}
