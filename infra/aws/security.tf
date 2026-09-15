# core_api (in the VPC) may open PostgreSQL to RDS and nothing else; RDS
# accepts PostgreSQL from core_api and nothing else.

resource "aws_security_group" "core_api" {
  name        = "${var.name_prefix}-core-api"
  description = "core_api Lambda: egress to RDS only"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.rds.id]
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.name_prefix}-rds"
  description = "RDS: PostgreSQL from core_api only"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_core_api" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.core_api.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}
