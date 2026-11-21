pipeline {
    agent any

    environment {
        CI = 'true'
        PATH = "/usr/bin:/usr/local/bin:$PATH"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Setup Dependencies') {
            steps {
                sh '''
                    echo "=== Installing System & Python Dependencies ==="
                    sudo apt-get update -y
                    sudo apt-get install -y python3-venv python3-pip libgl1 libglib2.0-0
                    python3 -m venv venv || true
                    . venv/bin/activate
                    pip install --upgrade pip
                    pip install -r edge-kiosk/requirements.txt
                    pip install -r aws-backend/handlers/requirements.txt
                    pip install pytest pytest-mock
                '''
            }
        }

        stage('Run Pytest Suite') {
            steps {
                sh '''
                    echo "=== Running 30 Automated Biometric & Cloud Tests ==="
                    . venv/bin/activate
                    pytest tests/ -v --tb=short
                '''
            }
        }

        stage('Build React Web Dashboard') {
            steps {
                dir('dashboard') {
                    sh '''
                        echo "=== Installing Frontend Dependencies & Building Vite App ==="
                        npm install
                        npm run build
                    '''
                }
            }
        }

        stage('Deploy / Reload Service') {
            steps {
                sh '''
                    echo "=== Reloading Production PM2 Daemon ==="
                    sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart attendance-dashboard || pm2 restart attendance-dashboard || true
                '''
            }
        }
    }

    post {
        success {
            echo "Pipeline succeeded! Smart Attendance application verified and deployed."
        }
        failure {
            echo "Pipeline failed! Please check console output for errors."
        }
    }
}
