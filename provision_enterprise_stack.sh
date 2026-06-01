#!/bin/bash
# NexaVision Enterprise Stack Provisioning Script
# Run this INSIDE the fresh Ubuntu Server VM (or on the future Cloud Server)
# This automates the installation of Docker, PostgreSQL, PostGIS, and Conda!

echo "[INFO] NexaVision ✨ Enterprise Stack Provisioner Initiating..."

# 1. System Updates
echo "[INFO] Updating Ubuntu OS..."
sudo apt update && sudo apt upgrade -y

# 2. Install Docker Engine
echo "[INFO] Installing Docker Engine for GeoServer & pgAdmin..."
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker $USER

# 3. Install Native PostgreSQL & PostGIS
echo "[INFO] Installing Native PostGIS Data Engine..."
sudo apt install -y postgresql postgis

# 4. Configure PostgreSQL Firewall for Docker & Build Database
echo "[INFO] Configuring PostgreSQL for Docker access and building magpi_enterprise..."
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" /etc/postgresql/*/main/postgresql.conf
echo "host    all             all             172.16.0.0/12           scram-sha-256" | sudo tee -a /etc/postgresql/*/main/pg_hba.conf

sudo -i -u postgres bash -c '
psql -c "CREATE USER magpi_admin WITH PASSWORD '\''YOUR_SECURE_PASSWORD'\'';"
psql -c "CREATE DATABASE magpi_enterprise OWNER magpi_admin;"
psql -d magpi_enterprise -c "CREATE EXTENSION postgis;"
psql -d magpi_enterprise -c "CREATE EXTENSION postgis_raster;"

psql -c "CREATE USER authentik WITH PASSWORD '\''YOUR_SECURE_PASSWORD'\'';"
psql -c "CREATE DATABASE authentik OWNER authentik;"
'

sudo systemctl restart postgresql

# 5. Install Miniconda for the Python Engine
echo "[INFO] Installing Miniconda..."
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh
bash miniconda.sh -b -p $HOME/miniconda
$HOME/miniconda/bin/conda init bash
rm miniconda.sh

echo "--------------------------------------------------------"
echo "[SUCCESS] The Enterprise Engine is Online!"
echo "Please type: source ~/.bashrc"
echo "Then you can start your docker-compose.yml and build the magpi-env!"
echo "--------------------------------------------------------"
