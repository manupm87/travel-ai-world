resource "aws_db_instance" "main" {
  identifier                = "${var.name_prefix}-postgres"
  engine                    = "postgres"
  engine_version            = "15"
  instance_class            = var.db_instance_class
  allocated_storage         = 20
  max_allocated_storage     = 100
  db_name                   = var.db_name
  username                  = var.db_user
  password                  = var.db_password
  db_subnet_group_name      = aws_db_subnet_group.main.name
  vpc_security_group_ids    = [aws_security_group.rds.id]
  publicly_accessible       = false
  multi_az                  = false
  backup_retention_period   = 7
  storage_encrypted         = true
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name_prefix}-final"
}
