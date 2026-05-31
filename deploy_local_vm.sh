#!/bin/bash
# MagPI Enterprise Ecosystem - Local VM Provisioning Script
# This script configures Libvirt/KVM to use your massive 8TB drive
# and automatically provisions the MagPI Enterprise Ubuntu Server.

echo "[INFO] MagPI ✨ Initiating Local Enterprise Forge..."

# 1. Ensure KVM and Virtualization tools are installed
echo "[INFO] Verifying KVM/Libvirt Hypervisor presence..."
sudo apt install -y qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils virtinst virt-manager

# 2. Storage Directory Check
echo "[INFO] Verifying /mnt/data8tb/nexa_vms/images exists..."
mkdir -p /mnt/data8tb/nexa_vms/images


# 3. Locate the Ubuntu ISO
# Modify this path if the name of your ISO is slightly different!
ISO_PATH=$(ls /mnt/data8tb/nexa_vms/iso/ubuntu-26.04*.iso 2>/dev/null | head -n 1)

if [ -z "$ISO_PATH" ]; then
    echo "[ERROR] Could not find the Ubuntu 26.04 ISO in /mnt/data8tb/nexa_vms/iso/"
    echo "Please ensure the .iso file is placed exactly in that folder and try again."
    exit 1
fi

echo "[INFO] Found Ubuntu ISO at: $ISO_PATH"

# 4. Provision the Enterprise VM
echo "[INFO] Spawning 'MagPI_Enterprise' Virtual Machine..."
echo "Specs: 8 vCPUs | 16GB RAM | 250GB NVMe-Backed Disk"

sudo virt-install \
  --name MagPI_Enterprise \
  --ram 16384 \
  --vcpus 8 \
  --disk path=/mnt/data8tb/nexa_vms/images/MagPI_Enterprise.qcow2,size=250,format=qcow2,bus=virtio \
  --os-variant ubuntu24.04 \
  --network network=default,model=virtio \
  --graphics vnc,listen=0.0.0.0 \
  --noautoconsole \
  --cdrom "$ISO_PATH"

echo "--------------------------------------------------------"
echo "[SUCCESS] The MagPI Enterprise VM has been spawned!"
echo "Open the 'Virtual Machine Manager' (virt-manager) GUI app on your computer."
echo "You will see 'MagPI_Enterprise' running. Double-click it to open the screen and complete the Ubuntu Server installation!"
echo "--------------------------------------------------------"
