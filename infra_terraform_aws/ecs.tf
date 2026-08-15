resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.name_prefix}-backend"
  retention_in_days = 14
}

resource "aws_iam_role" "ecs_execution" {
  name = "${var.name_prefix}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "${var.name_prefix}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ecs_secrets" {
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [for secret in aws_secretsmanager_secret.app : secret.arn]
    }]
  })
}

resource "aws_ecs_cluster" "main" {
  name = "${var.name_prefix}-cluster"
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.name_prefix}-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name         = "backend"
    image        = var.backend_image
    essential    = true
    portMappings = [{ containerPort = 8000, protocol = "tcp" }]
    secrets = [for key, secret_name in {
      NVIDIA_API_KEY       = "nvidia-api-key"
      SECRET_KEY           = "secret-key"
      GOOGLE_CLIENT_ID     = "google-client-id"
      GOOGLE_CLIENT_SECRET = "google-client-secret"
      DB_PASSWORD          = "db-password"
    } : { name = key, valueFrom = aws_secretsmanager_secret.app[secret_name].arn }]
    environment = [
      { name = "DB_ENGINE", value = "postgresql" },
      { name = "DB_SERVER", value = aws_db_instance.main.address },
      { name = "DB_PORT", value = "5432" },
      { name = "DB_USER", value = var.db_user },
      { name = "DB_NAME", value = var.db_name },
      { name = "FRONTEND_URL", value = var.frontend_url },
      { name = "BACKEND_CORS_ORIGINS", value = var.backend_cors_origins }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.backend.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "backend" {
  name            = "${var.name_prefix}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.http]
}
