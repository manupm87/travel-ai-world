output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "aws_region" {
  value = var.region
}

output "load_balancer_dns_name" {
  value = aws_lb.backend.dns_name
}

output "backend_url" {
  value = "http://${aws_lb.backend.dns_name}"
}

output "rds_endpoint" {
  value = aws_db_instance.main.address
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}
