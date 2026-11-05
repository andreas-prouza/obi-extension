[← Back to README](../../README.md)

# SSH setup

- [IBM i requirements](#ibm-i-requirements)
  - [SSH daemon and open source packages](#ssh-daemon-and-open-source-packages)
  - [Bash shell](#bash-shell)
  - [Home directory](#home-directory)
  - [User profile setup](#user-profile-setup)
- [SSH key authentication](#ssh-key-authentication)
- [Using the key in OBI](#using-the-key-in-obi)
- [Troubleshooting](#troubleshooting)

OBI communicates with your IBM i via SSH. Every remote command is executed with `bash`.


## IBM i requirements

### SSH daemon and open source packages

* The SSH daemon must be running:

  ```
  STRTCPSVR *SSHD
  ```

* The open source package manager (YUM) must be installed. You can install it with IBM i Access Client Solutions (ACS).


### Bash shell

Install bash:

```sh
yum install bash
```

Recommended: set bash as default shell of your user profile via SQL (instead of `*CURRENT` you can also provide the profile name):

```sql
CALL QSYS2.SET_PASE_SHELL_INFO('*CURRENT', '/QOpenSys/pkgs/bin/bash')
```

Or in a shell:

```sh
cl "RUNSQL ('CALL QSYS2.SET_PASE_SHELL_INFO(''*CURRENT'', ''/QOpenSys/pkgs/bin/bash'')')"
```


### Home directory

The home directory and its `.ssh` directory must exist, with strict permissions:

```sh
mkdir -p /home/$USER/.ssh
chmod 755 /home/$USER
chmod 700 /home/$USER/.ssh
```

> If the home directory is missing, OBI offers to create it before the first build.


### User profile setup

Add the open source packages to the `PATH` in `~/.profile`, `~/.bashrc` and `~/.bash_profile`:

```sh
for f in ~/.profile ~/.bashrc ~/.bash_profile; do
  echo 'export PATH="/QOpenSys/pkgs/bin:$PATH"' >> $f
  echo 'export TERM=xterm' >> $f
done
echo "PS1='\u@\H:\w $ '" >> ~/.bashrc   # prompt showing user, system and path
```

This is necessary to have the correct `PATH` in the IBM i shell.

> If `~/.bashrc` is missing, OBI offers to create it (with the `PATH` above) before the first build.


## SSH key authentication

With a key you don't need to enter a password.

**Linux / macOS**

1. Create a key pair:

   ```sh
   ssh-keygen -t ed25519 -f ~/.ssh/ibmi_ed25519
   ```

   If you set a passphrase, OBI asks for it when it connects and offers to keep it in the OS keychain (see [Using the key in OBI](#using-the-key-in-obi)).

2. Copy the public key to your IBM i:

   ```sh
   ssh-copy-id -i ~/.ssh/ibmi_ed25519.pub myuser@my-ibmi
   ```

**Windows**

Do the same in PowerShell (OpenSSH is included in Windows 10/11) or in WSL.
Without `ssh-copy-id`, append the content of the `.pub` file to `/home/<user>/.ssh/authorized_keys` on your IBM i.

**SSH config** (optional, for convenient command line use)

Create `~/.ssh/config` on your PC if it does not exist and add:

```
Host my-ibmi
  HostName my-ibmi.example.com
  User myuser
  IdentitiesOnly yes
  IdentityFile ~/.ssh/ibmi_ed25519
```

Now you should be able to log in without a prompt:

```sh
$ ssh my-ibmi
-bash-5.2$
```


## Using the key in OBI

In the **User configuration**, set:

* **User**: your IBM i user profile
* **SSH Key**: the path to the private key, e.g. `~/.ssh/ibmi_ed25519`, `$HOME/.ssh/ibmi_ed25519` or `%USERPROFILE%\.ssh\ibmi_ed25519`. `~` and environment variables are expanded on your PC.
  For a key with a passphrase, OBI asks for the passphrase and offers to save it in the OS keychain (VS Code's secret storage). A wrong saved passphrase is removed and asked for again.
* **Use the SSH agent** (`ssh-agent = true`): use the keys of the running `ssh-agent` (`SSH_AUTH_SOCK`), on Windows Pageant.
* **SSH port** (`ssh-port`): if the SSH daemon doesn't listen on port 22.
* **Compress the SSH connection** (`ssh-compression`, on by default): compresses the transfers (zlib). Turn it off on a fast LAN to save CPU time.

Without a key you can enter a **Password** instead. It is stored in VS Code's secret storage, not in the configuration file.
If no password is stored, OBI asks for it and offers to save it (*Save*, *Not now*, *Never for this profile*). A host or user entered at the prompt can be saved to the user configuration of the active profile.

OBI tries the methods in this order: agent, key, password.

OBI does not read `~/.ssh/config`; host, port, user and key must be set in the OBI configuration.


## Host key verification

OBI checks the host key of the IBM i on every connection, so nobody in between can pose as your IBM i and receive your password.

* **First connection:** OBI shows the fingerprint of the host key (e.g. `SHA256:lGMfqRi8…`) and asks whether you trust the host. Compare it with the fingerprint on the IBM i before you click *Trust and connect*:

  ```sh
  ssh-keygen -lf /QOpenSys/etc/ssh/ssh_host_ed25519_key.pub
  ```

  The folder depends on the installed OpenSSH package (e.g. `/QOpenSys/etc/ssh/` or `/QOpenSys/QIBM/UserData/SC1/OpenSSH/etc/`). Use the key type shown in the dialog (`ssh-ed25519`, `ecdsa-sha2-nistp256`, `ssh-rsa`).
  The fingerprint is stored in VS Code (for all workspaces), and the next connections don't ask again.
* **Known in `~/.ssh/known_hosts`:** if you have connected with `ssh` before, OBI trusts the key from there without asking. Hashed entries are supported, wildcard patterns are not.
* **Changed host key:** OBI refuses to connect and shows the stored and the received fingerprint. Someone could be intercepting the connection, or the host key was replaced (e.g. after reinstalling OpenSSH). If the change is expected, run **OBI: Forget stored SSH host key** from the command palette (or `ssh-keygen -R <host>` for a `known_hosts` entry) and connect again.


## Troubleshooting

* **"Login to user@host failed (check user, password or key)"**: the server rejected all methods. Check the user, the stored password (remove it on the configuration page to be asked again) and that the public key is in `~/.ssh/authorized_keys` on the IBM i.
* **"Can't reach host:port"**: wrong host or port, the SSH daemon isn't running, or a firewall blocks the port.

Most login problems are caused by the home directory:

* The home directory does not exist.
* The home directory does not match the user profile name.
* The owner of the home directory is someone else.
* The permissions of the home directory or `.ssh` are not strict enough (see [Home directory](#home-directory)).

If commands work in your shell but fail in OBI, check the `PATH` in `~/.bashrc` (see [User profile setup](#user-profile-setup)).
