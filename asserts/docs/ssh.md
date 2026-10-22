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

   If you set a passphrase, you will be asked for it on each login. OBI does not support keys with a passphrase.

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
* **SSH Key**: the **absolute** path to the private key, e.g. `/home/me/.ssh/ibmi_ed25519` or `C:\Users\me\.ssh\ibmi_ed25519`.
  `~` and environment variables are not expanded.

Without a key you can enter a **Password** instead. It is stored in VS Code's secret storage, not in the configuration file.
If neither is set, OBI asks for the password on each connection.

OBI does not read `~/.ssh/config`; host, user and key must be set in the OBI configuration.


## Troubleshooting

Most login problems are caused by the home directory:

* The home directory does not exist.
* The home directory does not match the user profile name.
* The owner of the home directory is someone else.
* The permissions of the home directory or `.ssh` are not strict enough (see [Home directory](#home-directory)).

If commands work in your shell but fail in OBI, check the `PATH` in `~/.bashrc` (see [User profile setup](#user-profile-setup)).
