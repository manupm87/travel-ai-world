# Private network only (ADR 0009): two private subnets for RDS and the
# core_api function. No internet gateway, no NAT, no VPC endpoints: nothing in
# the VPC needs the internet, and the ai_api function runs outside it.

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "${var.name_prefix}-vpc" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = { Name = "${var.name_prefix}-private-${count.index + 1}" }
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.name_prefix}-db"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${var.name_prefix}-db-subnet" }
}
